export type RobotClaim = { deviceId: string; code: string };

export function parseRobotCode(value: string): RobotClaim | null {
  const match = /^doso:\/\/robot\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\?claim=([a-z0-9]{6,32})$/i.exec(value.trim());
  return match ? { deviceId: match[1].toLowerCase(), code: match[2].toUpperCase() } : null;
}
