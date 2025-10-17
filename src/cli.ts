#!/usr/bin/env node

// src/cli.ts - WorkerScript CLI エントリーポイント

import * as fs from 'fs';
import * as path from 'path';
import { CLIRunner } from './cliRunner.js';

interface CLIOptions {
    interactive: boolean;
    debug: boolean;
    verbose: boolean;
    output?: string;
    help: boolean;
}

function parseArgs(args: string[]): { options: CLIOptions; scriptFile: string | undefined } {
    const options: CLIOptions = {
        interactive: false,
        debug: false,
        verbose: false,
        help: false
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
  -i, --interactive    インタラクティブ（REPL）モード
  -d, --debug          デバッグ情報を表示
  -v, --verbose        詳細なログを出力
  -o, --output FILE    出力をファイルに保存
  -h, --help          このヘルプを表示

例:
  npm run cli examples/hello.ws
  npm run cli examples/mandelbrot.ws --debug
  npm run cli --interactive
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

    const runner = new CLIRunner({
        debug: options.debug,
        verbose: options.verbose,
        ...(options.output && { outputFile: options.output })
    });

    try {
        if (options.interactive) {
            // インタラクティブモード
            if (options.verbose) console.log('📝 インタラクティブモードを開始します...');
            await runner.startInteractiveMode();
        } else if (scriptFile) {
            // ファイル実行モード
            if (!fs.existsSync(scriptFile)) {
                console.error(`❌ ファイルが見つかりません: ${scriptFile}`);
                process.exit(1);
            }

            const script = fs.readFileSync(scriptFile, 'utf-8');
            if (options.verbose) console.log(`📄 スクリプトファイルを読み込みました: ${scriptFile}`);
            
            await runner.executeScript(script, path.basename(scriptFile));
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

if (require.main === module) {
    main().catch(console.error);
}