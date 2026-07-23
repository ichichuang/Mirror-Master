export interface DetectionTask<FileIdentity> {
  readonly version: number;
  readonly file: FileIdentity;
}

export function isDetectionTaskCurrent<FileIdentity>(
  task: DetectionTask<FileIdentity>,
  currentVersion: number,
  currentFile: FileIdentity | null,
): boolean {
  return task.version === currentVersion && task.file === currentFile;
}
