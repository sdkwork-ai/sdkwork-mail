#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_DEV_PROFILE_ID,
  listHealthSurfaces,
  listOrchestrationProcesses,
  loadProfile,
  mergeRuntimeEnv,
  REPO_ROOT,
  resolveDevProfileId,
  resolveIamDevEnv,
  resolveSurfaceHttpUrl,
  waitForHttpHealthy,
  IAM_APPLICATION_BOOTSTRAP_ENV,
} from './lib/mail-topology.mjs';
import { mergeRepoDevBootstrapAccessTokenEnv } from '../../sdkwork-iam/scripts/dev/create-dev-bootstrap-access-token-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HEALTH_TIMEOUT_MS = 2000;
const STARTUP_WAIT_MS = 500;
const MAX_STARTUP_ATTEMPTS = 60;

function cargoCommand() {
  return process.platform === 'win32' ? 'cargo.exe' : 'cargo';
}

function pnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function flutterCommand() {
  return process.platform === 'win32' ? 'flutter.bat' : 'flutter';
}

function parseArgs(argv) {
  const settings = {
    deploymentProfile: 'standalone',
    target: 'pc',
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      settings.help = true;
      continue;
    }
    if (arg === '--deployment-profile') {
      settings.deploymentProfile = argv[index + 1] ?? settings.deploymentProfile;
      index += 1;
      continue;
    }
    if (arg === '--hosting') {
      throw new Error(
        '--hosting is retired; use --deployment-profile standalone|cloud',
      );
    }
    if (arg === '--service-layout') {
      throw new Error(
        '--service-layout is retired; use --deployment-profile standalone|cloud',
      );
    }
    if (arg === '--target') {
      settings.target = argv[index + 1] ?? settings.target;
      index += 1;
      continue;
    }
    if (arg === '--topology') {
      throw new Error(
        '--topology is retired; use --deployment-profile standalone|cloud',
      );
    }
    if (arg === '--dry-run') {
      settings.dryRun = true;
    }
  }

  return settings;
}

function printHelp() {
  console.log(`Usage: node scripts/mail-dev.mjs [options]

Topology-aware Mail dev entry. Loads etc/topology profile env via @sdkwork/app-topology.

Options:
  --deployment-profile <standalone|cloud>             Default: standalone
  --target <pc|h5|flutter|server>                     Default: pc
  --dry-run                                           Print plan without executing
  --help, -h
`);
}

function healthPathForSurface(surfaceId) {
  if (surfaceId === 'application.public-ingress') {
    return '/health';
  }
  return '/healthz';
}

function createMailApiServerProcess(env) {
  return {
    label: 'sdkwork-api-mail-standalone-gateway',
    command: cargoCommand(),
    args: ['run', '-p', 'sdkwork-api-mail-standalone-gateway'],
    cwd: REPO_ROOT,
    env,
  };
}

function buildDartDefineArgs(env) {
  const keys = [
    'sdkwork_mail_APPLICATION_PUBLIC_HTTP_URL',
    'sdkwork_mail_APP_API_BASE_URL',
    'sdkwork_mail_BACKEND_API_BASE_URL',
    'sdkwork_mail_PLATFORM_API_GATEWAY_HTTP_URL',
  ];
  const args = [];
  for (const key of keys) {
    const value = env[key];
    if (value) {
      args.push('--dart-define', `${key}=${value}`);
    }
  }
  return args;
}

function createClientProcess(target, env) {
  if (target === 'server') {
    return undefined;
  }
  if (target === 'h5') {
    return {
      label: 'sdkwork-mail-h5',
      command: pnpmCommand(),
      args: ['--dir', 'apps/sdkwork-mail-h5', 'dev'],
      cwd: REPO_ROOT,
      env,
    };
  }
  if (target === 'flutter') {
    return {
      label: 'sdkwork-mail-flutter-mobile',
      command: flutterCommand(),
      args: ['run', ...buildDartDefineArgs(env)],
      cwd: path.join(REPO_ROOT, 'apps/sdkwork-mail-flutter-mobile'),
      env,
    };
  }
  return {
    label: 'sdkwork-mail-pc',
    command: pnpmCommand(),
    args: ['--dir', 'apps/sdkwork-mail-pc', 'dev'],
    cwd: REPO_ROOT,
    env,
  };
}

function buildServerProcesses(profileId, env) {
  const processes = [];

  for (const processDef of listOrchestrationProcesses(profileId)) {
    if (processDef.id === 'pc-renderer') {
      continue;
    }
    if (processDef.id === 'platform.api-gateway') {
      continue;
    }
    if (processDef.id === 'application.public-ingress') {
      processes.push(createMailApiServerProcess(env));
    }
  }

  return processes;
}

async function waitForSurfaceHealth(profileId, env) {
  const surfaces = listHealthSurfaces(profileId);
  for (const surfaceId of surfaces) {
    const url = resolveSurfaceHttpUrl(env, surfaceId);
    if (!url) {
      continue;
    }
    const healthPath = healthPathForSurface(surfaceId);
    const healthUrl = `${url.replace(/\/+$/u, '')}${healthPath}`;
    let ready = false;
    for (let attempt = 0; attempt < MAX_STARTUP_ATTEMPTS; attempt += 1) {
      ready = await waitForHttpHealthy(healthUrl, HEALTH_TIMEOUT_MS);
      if (ready) {
        console.log(`[sdkwork-mail] healthy ${surfaceId} (${healthUrl})`);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, STARTUP_WAIT_MS));
    }
    if (!ready) {
      throw new Error(`timed out waiting for ${surfaceId} health at ${healthUrl}`);
    }
  }
}

function terminateProcessTree(child) {
  if (!child?.pid) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill();
}

async function main() {
  const settings = parseArgs(process.argv.slice(2));
  if (settings.help) {
    printHelp();
    process.exit(0);
  }

  const profileId =
    resolveDevProfileId(settings.deploymentProfile) || DEFAULT_DEV_PROFILE_ID;
  const profileEnv = loadProfile(profileId);
  const runtimeEnv = mergeRepoDevBootstrapAccessTokenEnv({
    repoRoot: REPO_ROOT,
    manifestPath: 'agent.app.config.json',
    appId: 'sdkwork-mail-pc',
    env: mergeRuntimeEnv(process.env, profileEnv, resolveIamDevEnv(process.env), IAM_APPLICATION_BOOTSTRAP_ENV, {
      sdkwork_mail_PROFILE_ID: profileId,
      sdkwork_mail_DEV_MODE: '1',
    }),
  });

  const processes = buildServerProcesses(profileId, runtimeEnv);
  const clientProcess = createClientProcess(settings.target, runtimeEnv);
  if (clientProcess) {
    processes.push(clientProcess);
  }

  if (settings.dryRun) {
    console.log(`[sdkwork-mail] profile=${profileId}`);
    for (const entry of processes) {
      console.log(`[${entry.label}] ${entry.command} ${entry.args.join(' ')}`);
    }
    process.exit(0);
  }

  const children = [];
  let shuttingDown = false;

  function shutdown(exceptChild) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (child !== exceptChild && child.exitCode == null && child.signalCode == null) {
        terminateProcessTree(child);
      }
    }
  }

  function attachProcessLifecycle(entry, child) {
    child.on('error', (error) => {
      process.stderr.write(
        `[${entry.label}] ${error instanceof Error ? error.message : String(error)}\n`,
      );
      shutdown(child);
      process.exitCode = 1;
    });
    child.on('exit', (code, signal) => {
      if (shuttingDown) {
        return;
      }
      if (code !== 0 && code != null) {
        process.stderr.write(`[${entry.label}] exited with code ${code}\n`);
        shutdown(child);
        process.exitCode = code;
        return;
      }
      if (signal) {
        process.stderr.write(`[${entry.label}] terminated by signal ${signal}\n`);
        shutdown(child);
        process.exitCode = 1;
      }
    });
  }

  for (const entry of processes) {
    const child = spawn(entry.command, entry.args, {
      cwd: entry.cwd ?? REPO_ROOT,
      env: entry.env,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    children.push(child);
    attachProcessLifecycle(entry, child);
  }

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());

  await waitForSurfaceHealth(profileId, runtimeEnv);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
