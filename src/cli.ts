#!/usr/bin/env node

// src/cli.ts - WorkerScript CLI エントリーポイント

import * as fs from 'fs';
import * as path from 'path';
import { CLIRunner } from './cliRunner.js';
import type { CLIRunnerConfig } from './cliRunner.js';
import { RealTimeCLIRunner } from './realtime/RealTimeCLIRunner.js';
import type { RealTimeCLIRunnerConfig } from './realtime/RealTimeCLIRunner.js';

interface CLIOptions {
    interactive: boolean;
    debug: boolean;
    verbose: boolean;
    output?: string;
    help: boolean;
    maxSteps?: number;
    unlimitedSteps: boolean;
    quiet: boolean;
    realtime: boolean;
    frameRate?: number;
    stepsPerFrame?: number;
    showFPS: boolean;
    showGrid: boolean;
    gridSize?: number;
    splitScreen: boolean;
    characterMode: boolean;
}

function parseArgs(args: string[]): { options: CLIOptions; scriptFile: string | undefined } {
    const options: CLIOptions = {
        interactive: false,
        debug: false,
        verbose: false,
        help: false,
        unlimitedSteps: false,
        quiet: false,
        realtime: false,
        showFPS: false,
        showGrid: false,
        splitScreen: false,
        characterMode: false
    };

    let scriptFile: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--interactive':
            case '-i':
                options.interactive = true;
                break;
            case '--debug':
            case '-d':
                options.debug = true;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--output':
            case '-o':
                const nextArg = args[++i];
                if (nextArg) {
                    options.output = nextArg;
                }
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            case '--unlimited':
            case '-u':
                options.unlimitedSteps = true;
                break;
            case '--max-steps':
            case '-m':
                const nextStepsArg = args[++i];
                if (nextStepsArg) {
                    const steps = parseInt(nextStepsArg, 10);
                    if (!isNaN(steps) && steps > 0) {
                        options.maxSteps = steps;
                    }
                }
                break;
            case '--quiet':
            case '-q':
                options.quiet = true;
                break;
            case '--realtime':
            case '-r':
                options.realtime = true;
                break;
            case '--fps':
                const nextFPSArg = args[++i];
                if (nextFPSArg) {
                    const fps = parseInt(nextFPSArg, 10);
                    if (!isNaN(fps) && fps > 0) {
                        options.frameRate = fps;
                    }
                }
                break;
            case '--steps-per-frame':
                const nextStepsPerFrameArg = args[++i];
                if (nextStepsPerFrameArg) {
                    const steps = parseInt(nextStepsPerFrameArg, 10);
                    if (!isNaN(steps) && steps > 0) {
                        options.stepsPerFrame = steps;
                    }
                }
                break;
            case '--show-fps':
                options.showFPS = true;
                break;
            case '--show-grid':
            case '-g':
                options.showGrid = true;
                break;
            case '--split-screen':
            case '-s':
                options.splitScreen = true;
                break;
            case '--char-mode':
            case '-c':
                options.characterMode = true;
                break;
            case '--grid-size':
                const nextGridSizeArg = args[++i];
                if (nextGridSizeArg) {
                    const size = parseInt(nextGridSizeArg, 10);
                    if (!isNaN(size) && size > 0) {
                        options.gridSize = size;
                    }
                }
                break;
            default:
                if (arg && !arg.startsWith('-') && !scriptFile) {
                    scriptFile = arg;
                }
                break;
        }
    }

    return { options, scriptFile };
}

function showHelp() {
    console.log(`
WorkerScript CLI - Grid Worker スクリプト実行環境

使用方法:
  npm run cli <script.ws>        スクリプトファイルを実行
  npm run cli --interactive      インタラクティブモードで起動

オプション:
  -i, --interactive       インタラクティブ（REPL）モード
  -d, --debug             デバッグ情報を表示
  -v, --verbose           詳細なログを出力
  -o, --output FILE       出力をファイルに保存
  -u, --unlimited         ステップ数無制限で実行
  -m, --max-steps N       最大ステップ数を指定（デフォルト: 100000）
  -q, --quiet             進捗表示を無効化（クリーンな出力）
  -r, --realtime          リアルタイムモード（キーボード入力対応）
  --fps N                 フレームレート指定（デフォルト: 30）
  --steps-per-frame N     1フレームあたりの実行ステップ数（デフォルト: 1000）
  --show-fps              FPS表示を有効化
  -g, --show-grid         グリッド表示を有効化（リアルタイムモード専用）
  -s, --split-screen      上下分割画面表示（--show-gridと併用）
  -c, --char-mode         キャラクターVRAMモード（カラーテキスト表示）
  --grid-size N           グリッド表示サイズ（デフォルト: 20x20）
  -h, --help              このヘルプを表示

例:
  npm run cli examples/hello.ws
  npm run cli examples/mandelbrot.ws --debug
  npm run cli -- examples/mandelbrot.ws --unlimited --quiet
  npm run cli -- examples/large-program.ws --max-steps 1000000
  npm run cli --interactive
  npm run cli -- examples/realtime_tests/01-key-echo.ws --realtime
  npm run cli -- examples/realtime_tests/03-wasd-movement.ws --realtime --show-grid
  npm run cli -- examples/realtime_tests/03-wasd-movement.ws --realtime --show-grid --split-screen
  npm run cli -- examples/realtime_tests/06-color-text.ws --realtime --show-grid --char-mode
`);
}

async function main() {
    const args = process.argv.slice(2);
    const { options, scriptFile } = parseArgs(args);

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (options.verbose) {
        console.log('🚀 WorkerScript CLI starting...');
        console.log(`Options:`, options);
        if (scriptFile) console.log(`Script file: ${scriptFile}`);
    }

    try {
        if (options.interactive) {
            // インタラクティブモード
            if (options.verbose) console.log('📝 インタラクティブモードを開始します...');
            const runnerConfig: CLIRunnerConfig = {
                debug: options.debug,
                verbose: options.verbose,
                unlimitedSteps: options.unlimitedSteps,
                quiet: options.quiet,
                ...(options.maxSteps && { maxSteps: options.maxSteps }),
                ...(options.output && { outputFile: options.output })
            };
            const runner = new CLIRunner(runnerConfig);
            await runner.startInteractiveMode();
        } else if (scriptFile) {
            // ファイル実行モード
            if (!fs.existsSync(scriptFile)) {
                console.error(`❌ ファイルが見つかりません: ${scriptFile}`);
                process.exit(1);
            }

            const script = fs.readFileSync(scriptFile, 'utf-8');
            if (options.verbose) console.log(`📄 スクリプトファイルを読み込みました: ${scriptFile}`);
            
            if (options.realtime) {
                // リアルタイムモード
                if (options.verbose) console.log('⚡ リアルタイムモードで実行します...');
                const realtimeConfig: RealTimeCLIRunnerConfig = {
                    debug: options.debug,
                    verbose: options.verbose,
                    ...(options.frameRate && { frameRate: options.frameRate }),
                    ...(options.stepsPerFrame && { stepsPerFrame: options.stepsPerFrame }),
                    showFPS: options.showFPS,
                    showGrid: options.showGrid,
                    splitScreen: options.splitScreen,
                    characterMode: options.characterMode,
                    ...(options.gridSize && { gridDisplaySize: options.gridSize })
                };
                const realtimeRunner = new RealTimeCLIRunner(realtimeConfig);
                await realtimeRunner.executeRealTime(script, path.basename(scriptFile));
            } else {
                // 通常モード
                const runnerConfig: CLIRunnerConfig = {
                    debug: options.debug,
                    verbose: options.verbose,
                    unlimitedSteps: options.unlimitedSteps,
                    quiet: options.quiet,
                    ...(options.maxSteps && { maxSteps: options.maxSteps }),
                    ...(options.output && { outputFile: options.output })
                };
                const runner = new CLIRunner(runnerConfig);
                await runner.executeScript(script, path.basename(scriptFile));
            }
        } else {
            console.error('❌ スクリプトファイルまたは --interactive オプションが必要です');
            showHelp();
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ 実行エラー:', error instanceof Error ? error.message : error);
        if (options.debug && error instanceof Error) {
            console.error('スタックトレース:', error.stack);
        }
        process.exit(1);
    }
}

// ES Module環境でのメイン実行判定
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && (process.argv[1] === __filename || path.resolve(process.argv[1]) === __filename);

if (isMainModule) {
    main().catch(console.error);
}