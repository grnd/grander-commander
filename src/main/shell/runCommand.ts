import { spawn } from 'node:child_process';

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const MAX_OUTPUT = 200_000; // 200 KB each of stdout/stderr

export async function runCommand(cmd: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const p = spawn('/bin/sh', ['-c', cmd], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += String(d).slice(0, MAX_OUTPUT - stdout.length);
    });
    p.stderr.on('data', (d) => {
      if (stderr.length < MAX_OUTPUT) stderr += String(d).slice(0, MAX_OUTPUT - stderr.length);
    });
    p.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
    p.on('error', (err) => {
      resolve({ stdout, stderr: String(err), exitCode: -1 });
    });
  });
}
