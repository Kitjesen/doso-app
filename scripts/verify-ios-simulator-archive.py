"""Read-only artifact checks: never extract or run an untrusted app archive."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import plistlib
import struct
import sys
import tarfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_archive(archive_path):
    with tarfile.open(archive_path, 'r:gz') as archive:
        members = archive.getmembers()
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and '..' not in path.parts, 'Unsafe archive path')
            require(path.parts and path.parts[0] == 'DOSO.app', 'Unexpected archive root')
            require(not member.issym() and not member.islnk(), 'Unexpected archive link')
        names = {member.name for member in members}
        require(len(names) == len(members), 'Duplicate archive member')

        def read(name):
            member = archive.getmember('DOSO.app/' + name)
            require(member.isfile() and member.size < 100_000_000, 'Invalid app resource')
            return archive.extractfile(member).read()

        info = plistlib.loads(read('Info.plist'))
        require(info['CFBundleIdentifier'] == 'com.doso.robot', 'Wrong app identity')
        require(info['CFBundleDisplayName'] == 'DOSO', 'Wrong display name')
        require(info['CFBundleSupportedPlatforms'] == ['iPhoneSimulator'], 'Not a simulator app')
        require(info['DTPlatformName'] == 'iphonesimulator', 'Wrong platform')
        bundle = read('main.jsbundle')
        require(len(bundle) > 0, 'Missing bundled JavaScript')
        plistlib.loads(read('PrivacyInfo.xcprivacy'))

        executable = read(info['CFBundleExecutable'])
        require(executable[:4] == bytes.fromhex('cafebabe'), 'Expected universal Mach-O')
        count = struct.unpack_from('>I', executable, 4)[0]
        require(0 < count <= 8, 'Invalid architecture count')
        architectures = []
        for index in range(count):
            cpu, _, offset, size, _ = struct.unpack_from('>IIIII', executable, 8 + index * 20)
            require(offset + size <= len(executable), 'Invalid Mach-O slice')
            binary = executable[offset:offset + size]
            require(binary[:4] == bytes.fromhex('cffaedfe'), 'Expected 64-bit little-endian Mach-O')
            commands = struct.unpack_from('<I', binary, 16)[0]
            position = 32
            platforms = []
            for _ in range(commands):
                command, length = struct.unpack_from('<II', binary, position)
                require(length >= 8 and position + length <= size, 'Invalid Mach-O command')
                if command == 0x32:  # LC_BUILD_VERSION
                    platforms.append(struct.unpack_from('<I', binary, position + 8)[0])
                position += length
            require(platforms == [7], 'Mach-O is not built for iOS Simulator')
            require(cpu in (0x01000007, 0x0100000C), 'Unexpected architecture')
            architectures.append('x86_64' if cpu == 0x01000007 else 'arm64')

        return {
            'status': 'static-artifact-check-pass-not-runtime-accepted',
            'archiveBytes': archive_path.stat().st_size,
            'archiveSha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
            'bundleIdentifier': info['CFBundleIdentifier'],
            'displayName': info['CFBundleDisplayName'],
            'version': info['CFBundleShortVersionString'],
            'buildNumber': info['CFBundleVersion'],
            'platform': info['DTPlatformName'],
            'sdk': info['DTSDKName'],
            'minimumOS': info['MinimumOSVersion'],
            'deviceFamilies': info['UIDeviceFamily'],
            'architectures': architectures,
            'jsBundleBytes': len(bundle),
            'jsBundleSha256': hashlib.sha256(bundle).hexdigest(),
            'privacyManifestPresent': True,
            'bluetoothPermissionPresent': bool(info.get('NSBluetoothAlwaysUsageDescription')),
            'exportComplianceDeclared': 'ITSAppUsesNonExemptEncryption' in info,
            'runtimeVerified': False,
            'signatureVerified': False,
        }


if __name__ == '__main__':
    require(len(sys.argv) == 2, 'Usage: verify-ios-simulator-archive.py <archive.tar.gz>')
    print(json.dumps(check_archive(Path(sys.argv[1])), ensure_ascii=False, indent=2))
