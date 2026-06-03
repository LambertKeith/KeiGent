/**
 * 引擎内部日志开关。
 *
 * 默认静音——引擎只通过 ProgressEvent 对外暴露进度，内部 [engine]/[browser]
 * 等调试日志默认不打印，避免污染 CLI 输出。
 *
 * 调试时 setVerbose(true) 恢复全部内部日志。
 */
let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function isVerbose(): boolean {
  return verbose;
}

/** 内部调试日志——仅 verbose 时输出。 */
export function vlog(...args: unknown[]): void {
  if (verbose) console.log(...args);
}

/** 内部警告——仅 verbose 时输出（真正需要用户看到的错误走 ProgressEvent）。 */
export function vwarn(...args: unknown[]): void {
  if (verbose) console.warn(...args);
}
