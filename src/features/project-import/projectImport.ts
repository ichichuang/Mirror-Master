import { PROJECT_SCHEMA_VERSION, parseBeadProject, type BeadProject } from '../../domain/project';

export const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024;

export class ProjectImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectImportError';
    this.code = code;
  }
}

export function parseProjectJsonText(text: string): BeadProject {
  if (new TextEncoder().encode(text).byteLength > MAX_PROJECT_JSON_BYTES) {
    throw new ProjectImportError(
      'PROJECT_FILE_TOO_LARGE',
      '项目文件过大，无法在浏览器中安全打开。',
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ProjectImportError(
      'PROJECT_JSON_INVALID',
      '项目文件不是有效的 JSON，请重新导出后再试。',
      { cause: error },
    );
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion !== PROJECT_SCHEMA_VERSION
  ) {
    throw new ProjectImportError(
      'PROJECT_VERSION_UNSUPPORTED',
      `项目版本不受支持；当前应用只支持 ${PROJECT_SCHEMA_VERSION}。`,
    );
  }

  try {
    return parseBeadProject(value);
  } catch (error) {
    throw new ProjectImportError(
      'PROJECT_SCHEMA_INVALID',
      error instanceof Error ? error.message : '项目内容无效，无法继续编辑。',
      { cause: error },
    );
  }
}
