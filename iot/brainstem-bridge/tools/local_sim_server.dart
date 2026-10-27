/// Loopback-only Brainstem simulation server for DOSO local development.
///
/// This boots the real Brain, ONNX policy, FSM and UnifiedCmsServer in
/// simulation mode. It never opens CAN or any hardware transport.
library;

import 'dart:async';
import 'dart:io';

import 'package:grpc/grpc.dart';
import 'package:han_dog/han_dog.dart';
import 'package:han_dog_brain/han_dog_brain.dart';
import 'package:logging/logging.dart';

final _log = Logger('doso.local_sim_server');

Future<void> main(List<String> args) async {
  _configureLogging();
  final options = _Options.parse(args);
  final profiles = await loadProfiles(options.profileDirectory);
  final profile = profiles[options.profileName];
  if (profile == null) {
    stderr.writeln(
      'Profile "${options.profileName}" not found in '
      '${options.profileDirectory}; available=${profiles.keys.join(",")}',
    );
    exitCode = 2;
    return;
  }

  final historySize = await inferHistorySizeFromModel(
    modelPath: profile.modelPath,
    tensorSize: profile.toObservationBuilder().tensorSize,
  );
  final inputName = await inferInputNameFromModel(modelPath: profile.modelPath);
  if (historySize == null || inputName == null || inputName.isEmpty) {
    stderr.writeln('Unable to inspect ONNX model ${profile.modelPath}');
    exitCode = 3;
    return;
  }

  final sim = SimSensorService(standingPose: profile.standingPose);
  final clock = StreamController<void>.broadcast();
  final brain = Brain(
    imu: sim,
    joint: sim,
    clock: clock,
    standingPose: profile.standingPose,
    sittingPose: profile.sittingPose,
    historySize: historySize,
    standUpCounts: profile.standUpCounts,
    sitDownCounts: profile.sitDownCounts,
    observationBuilder: profile.toObservationBuilder(),
  );
  await brain.loadModel(profile.modelPath, inputName: inputName);

  final fsm = M(brain)..add(Init());
  try {
    await fsm.stream
        .firstWhere((state) => state is Grounded)
        .timeout(const Duration(seconds: 5));
  } on TimeoutException {
    stderr.writeln('Brainstem FSM did not reach Grounded');
    await fsm.close();
    brain.dispose();
    await clock.close();
    exitCode = 4;
    return;
  }

  final profilesManager = ProfileManager(
    profiles: profiles,
    brain: brain,
    initial: options.profileName,
  );
  final gains = GainManager(
    inferKp: profile.inferKp,
    inferKd: profile.inferKd,
    standUpKp: profile.standUpKp,
    standUpKd: profile.standUpKd,
    sitDownKp: profile.sitDownKp,
    sitDownKd: profile.sitDownKd,
  );
  final service = UnifiedCmsServer(
    brain: brain,
    m: fsm,
    mode: CmsMode.simulation,
    simInjector: sim,
    gains: gains,
  )..profileManager = profilesManager;
  final server = Server.create(services: <Service>[service]);
  await server.serve(address: InternetAddress.loopbackIPv4, port: options.port);
  _log.info(
    'READY address=127.0.0.1 port=${options.port} '
    'profile=${options.profileName} model=${profile.modelPath} '
    'historySize=$historySize input=$inputName',
  );

  var stopping = false;
  late final Timer stopPoller;
  Future<void> shutdown(String reason) async {
    if (stopping) return;
    stopping = true;
    stopPoller.cancel();
    _log.info('Stopping local simulation server: $reason');
    await service.dispose();
    await server.shutdown().timeout(const Duration(seconds: 3));
    await fsm.close();
    brain.dispose();
    await clock.close();
  }

  final done = Completer<void>();
  stopPoller = Timer.periodic(const Duration(milliseconds: 200), (_) async {
    if (options.stopFile == null ||
        !File(options.stopFile!).existsSync() ||
        done.isCompleted) {
      return;
    }
    try {
      await shutdown('stop file');
      done.complete();
    } catch (error, stackTrace) {
      _log.severe('Graceful shutdown failed', error, stackTrace);
      done.completeError(error, stackTrace);
    }
  });

  if (!Platform.isWindows) {
    for (final signal in <ProcessSignal>[
      ProcessSignal.sigint,
      ProcessSignal.sigterm,
    ]) {
      signal.watch().listen((_) async {
        if (done.isCompleted) return;
        await shutdown(signal.toString());
        done.complete();
      });
    }
  }
  await done.future;
}

void _configureLogging() {
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    final line =
        '${record.time.toUtc().toIso8601String()} ${record.level.name} '
        '${record.loggerName}: ${record.message}';
    if (record.level >= Level.WARNING) {
      stderr.writeln(line);
      if (record.error != null) stderr.writeln(record.error);
      if (record.stackTrace != null) stderr.writeln(record.stackTrace);
    } else {
      stdout.writeln(line);
    }
  });
}

final class _Options {
  const _Options({
    required this.port,
    required this.profileDirectory,
    required this.profileName,
    required this.stopFile,
  });

  final int port;
  final String profileDirectory;
  final String profileName;
  final String? stopFile;

  static _Options parse(List<String> args) {
    final values = <String, String>{};
    for (var index = 0; index < args.length; index++) {
      final key = args[index];
      if (!key.startsWith('--') || index + 1 >= args.length) {
        throw FormatException('Expected --key value, got "$key"');
      }
      values[key.substring(2)] = args[++index];
    }
    final port = int.tryParse(values['port'] ?? '13147');
    if (port == null || port < 1 || port > 65535) {
      throw FormatException('Invalid --port: ${values['port']}');
    }
    return _Options(
      port: port,
      profileDirectory: values['profile-dir'] ?? 'profiles',
      profileName: values['profile'] ?? 'mini',
      stopFile: values['stop-file'],
    );
  }
}
