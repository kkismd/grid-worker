#!/usr/bin/env node

// src/cli.ts - WorkerScript CLI エントリーポイント

import * as fs from 'fs';
import * as path from 'path';
import { CLIRunner } from './cliRunner.js';
import type { CLIRunnerConfig } from './cliRunner.js';
import { RealTimeCLIRunner } from './realtime/RealTimeCLIRunner.js';
import type { RealTimeCLIRunnerConfig } from './realtime/RealTimeCLIRunner.js';

// サブコマンドの型定義
type Subcommand = 'run' | 'exec' | 'debug' | 'watch' | 'text' | 'play' | 'repl' | 'bench';

interface SubcommandConfig {
    name: Subcommand;
    description: string;
    runner: 'cli' | 'realtime';
    defaults: Partial<CLIOptions>;
    availableOptions?: string[];  // 許可するオプション（未指定なら全て許可）
}

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
    noGrid: boolean;
    gridSize?: number;
    splitScreen: boolean;
    characterMode: boolean;
}

// サブコマンドのプリセット定義
const SUBCOMMANDS: Record<Subcommand, SubcommandConfig> = {
    run: {
        name: 'run',
        description: '通常実行（デフォルト）',
        runner: 'cli',
        defaults: {}
    },
    exec: {
        name: 'exec',
        description: 'テキスト出力専用（パイプライン向け）',
        runner: 'cli',
        defaults: {
            noGrid: true,
            quiet: false,
            verbose: false,
            maxSteps: 100000
        }
    },
    debug: {
        name: 'debug',
        description: 'デバッグ実行',
        runner: 'cli',
        defaults: {
            debug: true,
            verbose: true,
            maxSteps: 10000
        }
    },
    watch: {
        name: 'watch',
        description: 'リアルタイム監視',
        runner: 'realtime',
        defaults: {
            realtime: true,
            showGrid: true,
            splitScreen: true,
            verbose: true,
            frameRate: 30,
            stepsPerFrame: 1000
        }
    },
    text: {
        name: 'text',
        description: 'テキストゲーム/対話処理',
        runner: 'realtime',
        defaults: {
            realtime: true,
            noGrid: true,
            splitScreen: false,
            verbose: true,
            frameRate: 30,
            stepsPerFrame: 1
        }
    },
    play: {
        name: 'play',
        description: 'グリッドゲームモード',
        runner: 'realtime',
        defaults: {
            realtime: true,
            showGrid: true,
            splitScreen: false,
            verbose: true,
            frameRate: 15,
            stepsPerFrame: 1
        }
    },
    repl: {
        name: 'repl',
        description: 'インタラクティブモード',
        runner: 'cli',
        defaults: {
            interactive: true
        }
    },
    bench: {
        name: 'bench',
        description: 'ベンチマーク実行',
        runner: 'cli',
        defaults: {
            unlimitedSteps: true,
            quiet: true,
            noGrid: true
        }
    }
};

/**
 * コマンドライン引数からサブコマンドをパースする
 * @param args コマンドライン引数
 * @returns サブコマンドと残りの引数
 */
function parseSubcommand(args: string[]): {
    subcommand: Subcommand;
    remainingArgs: string[];
} {
    // 引数が空の場合はデフォルトの 'run'
    if (args.length === 0) {
        return {
            subcommand: 'run',
            remainingArgs: []
        };
    }

    const firstArg = args[0];
    
    // firstArgがundefinedの場合（念のため）
    if (!firstArg) {
        return {
            subcommand: 'run',
            remainingArgs: args
        };
    }
    
    // 第1引数がオプション（-で始まる）の場合はデフォルトの 'run'
    if (firstArg.startsWith('-')) {
        return {
            subcommand: 'run',
            remainingArgs: args
        };
    }
    
    // 第1引数が.wsファイルの場合はデフォルトの 'run'
    if (firstArg.endsWith('.ws')) {
        return {
            subcommand: 'run',
            remainingArgs: args
        };
    }
    
    // 第1引数がサブコマンドとして登録されているかチェック
    const potentialSubcommand = firstArg as Subcommand;
    if (SUBCOMMANDS[potentialSubcommand]) {
        return {
            subcommand: potentialSubcommand,
            remainingArgs: args.slice(1)
        };
    }
    
    // それ以外の場合はデフォルトの 'run'（スクリプトファイル名かもしれない）
    return {
        subcommand: 'run',
        remainingArgs: args
    };
}

/**
 * サブコマンドのデフォルト値とコマンドラインオプションをマージする
 * コマンドラインオプションが優先される
 * @param subcommandDefaults サブコマンドのデフォルト値
 * @param parsedOptions パースされたコマンドラインオプション
 * @returns マージされたオプション
 */
function mergeOptions(
    subcommandDefaults: Partial<CLIOptions>,
    parsedOptions: CLIOptions
): CLIOptions {
    // 基本的なマージ：サブコマンドのデフォルト値を基に、
    // 明示的に指定されたオプションで上書き
    const merged: CLIOptions = {
        ...parsedOptions
    };
    
    // デフォルト値があり、かつパースされたオプションが明示的に指定されていない場合のみ適用
    for (const [key, value] of Object.entries(subcommandDefaults)) {
        if (value !== undefined) {
            // boolean値の場合：デフォルトがtrueで、parsedOptionsがfalse（デフォルト）なら上書き
            if (typeof value === 'boolean') {
                const k = key as keyof CLIOptions;
                if (value === true && merged[k] === false) {
                    (merged[k] as boolean) = true;
                }
            }
            // 数値の場合：デフォルトがあり、parsedOptionsがundefinedなら上書き
            else if (typeof value === 'number') {
                const k = key as keyof CLIOptions;
                if (merged[k] === undefined) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (merged as any)[k] = value;
                }
            }
        }
    }
    
    return merged;
}

function parseBooleanOption(arg: string, options: CLIOptions): boolean {
    switch (arg) {
        case '--interactive':
        case '-i':
            options.interactive = true;
            return true;
        case '--debug':
        case '-d':
            options.debug = true;
            return true;
        case '--verbose':
        case '-v':
            options.verbose = true;
            return true;
        case '--help':
        case '-h':
            options.help = true;
            return true;
        case '--unlimited':
        case '-u':
            options.unlimitedSteps = true;
            return true;
        case '--quiet':
        case '-q':
            options.quiet = true;
            return true;
        case '--realtime':
        case '-r':
            options.realtime = true;
            return true;
        case '--show-fps':
            options.showFPS = true;
            return true;
        case '--show-grid':
        case '-g':
            options.showGrid = true;
            return true;
        case '--no-grid':
            options.noGrid = true;
            return true;
        case '--split-screen':
        case '-s':
            options.splitScreen = true;
            return true;
        case '--char-mode':
        case '-c':
            options.characterMode = true;
            return true;
        default:
            return false;
    }
}

function parseValueOption(arg: string, nextArg: string | undefined, options: CLIOptions): number {
    switch (arg) {
        case '--output':
        case '-o':
            if (nextArg) {
                options.output = nextArg;
                return 1;
            }
            return 0;
        case '--max-steps':
        case '-m':
            if (nextArg) {
                const steps = parseInt(nextArg, 10);
                if (!isNaN(steps) && steps > 0) {
                    options.maxSteps = steps;
                    return 1;
                }
            }
            return 0;
        case '--fps':
            if (nextArg) {
                const fps = parseInt(nextArg, 10);
                if (!isNaN(fps) && fps > 0) {
                    options.frameRate = fps;
                    return 1;
                }
            }
            return 0;
        case '--steps-per-frame':
            if (nextArg) {
                const steps = parseInt(nextArg, 10);
                if (!isNaN(steps) && steps > 0) {
                    options.stepsPerFrame = steps;
                    return 1;
                }
            }
            return 0;
        case '--grid-size':
            if (nextArg) {
                const size = parseInt(nextArg, 10);
                if (!isNaN(size) && size > 0) {
                    options.gridSize = size;
                    return 1;
                }
            }
            return 0;
        default:
            return -1;
    }
}

function parseSingleOption(arg: string, nextArg: string | undefined, options: CLIOptions): number {
    if (parseBooleanOption(arg, options)) {
        return 0;
    }
    
    const valueConsumed = parseValueOption(arg, nextArg, options);
    return valueConsumed;
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
        noGrid: false,
        splitScreen: false,
        characterMode: false
    };

    let scriptFile: string | undefined;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const nextArg = args[i + 1];
        
        const consumed = parseSingleOption(arg, nextArg, options);
        
        if (consumed >= 0) {
            i += consumed;
        } else if (arg && !arg.startsWith('-') && !scriptFile) {
            scriptFile = arg;
        }
    }

    return { options, scriptFile };
}

function showHelp() {
    console.log(`
WorkerScript CLI - Grid Worker スクリプト実行環境

使用方法:
  npm run cli <subcommand> <script.ws> [options]
  npm run cli <script.ws> [options]  # runサブコマンド省略可

サブコマンド:
  run       通常実行（デフォルト）
  exec      テキスト出力専用（パイプライン向け）
  debug     デバッグ実行（詳細ログ + デバッグ情報）
  watch     リアルタイム監視（分割画面 + グリッド + トランスクリプト）
  text      テキストゲーム/対話処理（グリッドなしリアルタイム）
  play      グリッドゲームモード（高応答性 + グリッド表示）
  repl      インタラクティブモード（REPL）
  bench     ベンチマーク実行（統計情報表示）

オプション:
  -h, --help              このヘルプを表示
  -i, --interactive       インタラクティブ（REPL）モード
  -d, --debug             デバッグ情報を表示
  -v, --verbose           詳細なログを出力
  -o, --output FILE       出力をファイルに保存
  -u, --unlimited         ステップ数無制限で実行
  -m, --max-steps N       最大ステップ数を指定（デフォルト: 100000）
  -q, --quiet             進捗表示を無効化（クリーンな出力）
  --no-grid               グリッド表示を抑制（テキスト出力のみ）
  -r, --realtime          リアルタイムモード（キーボード入力対応）
  --fps N                 フレームレート指定（デフォルト: 30）
  --steps-per-frame N     1フレームあたりの実行ステップ数（デフォルト: 1000）
  --show-fps              FPS表示を有効化
  -g, --show-grid         グリッド表示を有効化（リアルタイムモード専用）
  -s, --split-screen      上下分割画面表示（--show-gridと併用）
  -c, --char-mode         キャラクターVRAMモード（カラーテキスト表示）
  --grid-size N           グリッド表示サイズ（デフォルト: 20x20）

詳細: npm run cli <subcommand> --help

例:
  # 通常実行
  npm run cli run examples/hello.ws
  npm run cli examples/hello.ws  # runは省略可
  
  # サブコマンド別の実行
  npm run cli exec examples/data.ws | jq
  npm run cli debug examples/test.ws
  npm run cli watch examples/mandelbrot.ws
  npm run cli text examples/adventure.ws
  npm run cli play examples/bouncing_ball.ws
  npm run cli bench examples/sort.ws
  
  # レガシー形式（引き続き動作）
  npm run cli -- examples/mandelbrot.ws --debug --verbose
  npm run cli --interactive
  npm run cli -- examples/realtime_tests/03-wasd-movement.ws --realtime --show-grid
  npm run cli -- examples/realtime_tests/06-color-text.ws --realtime --show-grid --char-mode
`);
}

/**
 * サブコマンド別のヘルプを表示
 * @param subcommand サブコマンド名
 */
function showSubcommandHelp(subcommand: Subcommand) {
    const config = SUBCOMMANDS[subcommand];
    
    console.log(`
WorkerScript CLI - ${config.description}

使用方法:
  npm run cli ${subcommand} <script.ws> [options]

デフォルト設定:`);
    
    // デフォルト値を表示
    const defaults = config.defaults;
    if (Object.keys(defaults).length > 0) {
        for (const [key, value] of Object.entries(defaults)) {
            console.log(`  ${key}: ${value}`);
        }
    } else {
        console.log('  （標準設定を使用）');
    }
    
    console.log(`
利用可能なオプション:
  -h, --help              このヘルプを表示
  -v, --verbose           詳細なログを出力
  -d, --debug             デバッグ情報を表示
  -q, --quiet             進捗表示を無効化
  -o, --output FILE       出力をファイルに保存
  -u, --unlimited         ステップ数無制限で実行
  -m, --max-steps N       最大ステップ数を指定
  --no-grid               グリッド表示を抑制
  --show-grid             グリッド表示を有効化（リアルタイムモード）
  --split-screen          上下分割画面表示
  --fps N                 フレームレート指定
  --steps-per-frame N     1フレームあたりの実行ステップ数
  --show-fps              FPS表示を有効化
  --char-mode             キャラクターVRAMモード
  --grid-size N           グリッド表示サイズ

使用例:`);
    
    // サブコマンド別の使用例
    switch (subcommand) {
        case 'run':
            console.log(`  npm run cli run examples/hello.ws
  npm run cli run examples/mandelbrot.ws --verbose`);
            break;
        case 'exec':
            console.log(`  npm run cli exec examples/data.ws | jq
  npm run cli exec examples/generator.ws > output.txt
  npm run cli exec examples/processor.ws | grep "result"`);
            break;
        case 'debug':
            console.log(`  npm run cli debug examples/test.ws
  npm run cli debug examples/broken.ws --max-steps 100`);
            break;
        case 'watch':
            console.log(`  npm run cli watch examples/mandelbrot.ws
  npm run cli watch examples/complex.ws --fps 10 --steps-per-frame 100
  npm run cli watch examples/game.ws --show-fps`);
            break;
        case 'text':
            console.log(`  npm run cli text examples/adventure.ws
  npm run cli text examples/ascii_art.ws --fps 60
  npm run cli text examples/dialogue.ws --steps-per-frame 10`);
            break;
        case 'play':
            console.log(`  npm run cli play examples/bouncing_ball.ws
  npm run cli play examples/snake.ws --fps 10
  npm run cli play examples/game80.ws --char-mode --grid-size 40`);
            break;
        case 'repl':
            console.log(`  npm run cli repl
  npm run cli -i`);
            break;
        case 'bench':
            console.log(`  npm run cli bench examples/mandelbrot.ws
  npm run cli bench examples/sort.ws --iterations 10`);
            break;
    }
    
    console.log('');
}

function buildCLIRunnerConfig(options: CLIOptions): CLIRunnerConfig {
    return {
        debug: options.debug,
        verbose: options.verbose,
        unlimitedSteps: options.unlimitedSteps,
        quiet: options.quiet,
        noGrid: options.noGrid,
        ...(options.maxSteps && { maxSteps: options.maxSteps }),
        ...(options.output && { outputFile: options.output })
    };
}

function buildRealTimeRunnerConfig(options: CLIOptions): RealTimeCLIRunnerConfig {
    return {
        debug: options.debug,
        verbose: options.verbose,
        ...(options.frameRate && { frameRate: options.frameRate }),
        ...(options.stepsPerFrame && { stepsPerFrame: options.stepsPerFrame }),
        showFPS: options.showFPS,
        showGrid: options.showGrid,
        noGrid: options.noGrid,
        splitScreen: options.splitScreen,
        characterMode: options.characterMode,
        ...(options.gridSize && { gridDisplaySize: options.gridSize }),
        ...(options.output && { outputFile: options.output })
    };
}

async function executeInteractiveMode(options: CLIOptions): Promise<void> {
    if (options.verbose) console.log('📝 インタラクティブモードを開始します...');
    const runnerConfig = buildCLIRunnerConfig(options);
    const runner = new CLIRunner(runnerConfig);
    await runner.startInteractiveMode();
}

async function executeNormalMode(script: string, scriptFile: string, options: CLIOptions): Promise<void> {
    const runnerConfig = buildCLIRunnerConfig(options);
    const runner = new CLIRunner(runnerConfig);
    await runner.executeScript(script, path.basename(scriptFile));
}

async function executeRealtimeMode(script: string, scriptFile: string, options: CLIOptions): Promise<void> {
    if (options.verbose) console.log('⚡ リアルタイムモードで実行します...');
    const realtimeConfig = buildRealTimeRunnerConfig(options);
    const realtimeRunner = new RealTimeCLIRunner(realtimeConfig);
    await realtimeRunner.executeRealTime(script, path.basename(scriptFile));
}

async function executeScriptFile(scriptFile: string, options: CLIOptions): Promise<void> {
    if (!fs.existsSync(scriptFile)) {
        console.error(`❌ ファイルが見つかりません: ${scriptFile}`);
        process.exit(1);
    }

    const script = fs.readFileSync(scriptFile, 'utf-8');
    if (options.verbose) console.log(`📄 スクリプトファイルを読み込みました: ${scriptFile}`);
    
    if (options.realtime) {
        await executeRealtimeMode(script, scriptFile, options);
    } else {
        await executeNormalMode(script, scriptFile, options);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    const { subcommand, remainingArgs } = parseSubcommand(args);
    const { options: parsedOptions, scriptFile } = parseArgs(remainingArgs);
    
    if (parsedOptions.help) {
        const firstArg = args[0];
        if (firstArg && !firstArg.startsWith('-') && !firstArg.endsWith('.ws') && SUBCOMMANDS[firstArg as Subcommand]) {
            showSubcommandHelp(subcommand);
        } else {
            showHelp();
        }
        process.exit(0);
    }
    
    const subcommandConfig = SUBCOMMANDS[subcommand];
    const options = mergeOptions(subcommandConfig.defaults, parsedOptions);

    if (options.verbose) {
        console.log('🚀 WorkerScript CLI starting...');
        console.log(`Subcommand: ${subcommand}`);
        console.log(`Options:`, options);
        if (scriptFile) console.log(`Script file: ${scriptFile}`);
    }

    try {
        if (options.interactive) {
            await executeInteractiveMode(options);
        } else if (scriptFile) {
            await executeScriptFile(scriptFile, options);
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