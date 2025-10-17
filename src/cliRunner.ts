// src/cliRunner.ts - CLI実行ロジック

import * as readline from 'readline';
import * as fs from 'fs';
import WorkerInterpreter from './workerInterpreter.js';
import { GridRenderer } from './gridRenderer.js';

export interface CLIRunnerConfig {
    debug: boolean;
    verbose: boolean;
    outputFile?: string;
}

export class CLIRunner {
    private config: CLIRunnerConfig;
    private gridData: number[];
    private gridRenderer: GridRenderer;
    private transcript: string[] = [];

    constructor(config: CLIRunnerConfig) {
        this.config = config;
        // 100x100 グリッドを初期化（すべて0）
        this.gridData = new Array(10000).fill(0);
        this.gridRenderer = new GridRenderer(100, 100);
    }

    /**
     * スクリプトを実行する
     */
    async executeScript(script: string, scriptName?: string): Promise<void> {
        if (this.config.verbose) {
            console.log(`🔍 スクリプトを解析中: ${scriptName || 'Unknown'}`);
        }

        // トランスクリプトをクリア
        this.transcript = [];

        // WorkerInterpreterを設定
        const interpreter = new WorkerInterpreter({
            gridData: this.gridData,
            peekFn: (index: number) => this.peek(index),
            pokeFn: (x: number, y: number, value: number) => this.poke(x, y, value),
            logFn: (...args: any[]) => this.log(...args)
        });

        try {
            // スクリプトをロード
            interpreter.loadScript(script);
            
            if (this.config.verbose) {
                console.log('✅ スクリプトの解析が完了しました');
                console.log('🚀 実行を開始します...\n');
            }

            // 実行
            const generator = interpreter.run();
            let step = 0;
            let result = generator.next();

            while (!result.done) {
                step++;
                if (this.config.debug && step % 100 === 0) {
                    console.log(`[DEBUG] ステップ ${step} 実行中...`);
                }
                result = generator.next();
                
                // 無限ループ防止（10万ステップで打ち切り）
                if (step > 100000) {
                    console.log('⚠️  実行ステップ数が上限に達しました（10万ステップ）');
                    break;
                }
            }

            if (this.config.verbose) {
                console.log(`\n✅ 実行完了 (${step} ステップ)`);
            }

            // 結果を表示
            this.displayResults();

        } catch (error) {
            console.error('❌ 実行エラー:', error instanceof Error ? error.message : error);
            if (this.config.debug && error instanceof Error) {
                console.error('スタックトレース:', error.stack);
            }
            throw error;
        }
    }

    /**
     * インタラクティブモードを開始
     */
    async startInteractiveMode(): Promise<void> {
        console.log('📝 WorkerScript インタラクティブモード');
        console.log('終了するには .exit と入力してください\n');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'ws> '
        });

        const commands: string[] = [];
        
        rl.prompt();

        rl.on('line', async (input) => {
            const trimmed = input.trim();
            
            if (trimmed === '.exit') {
                rl.close();
                return;
            }
            
            if (trimmed === '.clear') {
                this.gridData.fill(0);
                this.transcript = [];
                console.log('🧹 グリッドとトランスクリプトをクリアしました');
                rl.prompt();
                return;
            }
            
            if (trimmed === '.grid') {
                this.displayGrid();
                rl.prompt();
                return;
            }
            
            if (trimmed === '.help') {
                this.showInteractiveHelp();
                rl.prompt();
                return;
            }
            
            if (trimmed) {
                commands.push(trimmed);
                
                try {
                    const script = commands.join('\n');
                    await this.executeScript(script, 'interactive');
                } catch (error) {
                    console.error('❌', error instanceof Error ? error.message : error);
                }
            }
            
            rl.prompt();
        });

        rl.on('close', () => {
            console.log('\n👋 インタラクティブモードを終了します');
            process.exit(0);
        });
    }

    /**
     * PEEK関数の実装
     */
    private peek(index: number): number {
        if (index < 0 || index >= this.gridData.length) {
            return 0; // 範囲外は0を返す
        }
        return this.gridData[index] || 0;
    }

    /**
     * POKE関数の実装
     * 座標系: X=左右方向（列）、Y=上下方向（行）
     * (0,0)は左上、(99,99)は右下
     */
    private poke(x: number, y: number, value: number): void {
        const wrappedX = ((x % 100) + 100) % 100;  // X座標（列番号）
        const wrappedY = ((y % 100) + 100) % 100;  // Y座標（行番号）
        // 標準的な2D配列のインデックス計算: index = y * width + x
        const index = wrappedY * 100 + wrappedX;
        
        // 値を0-255の範囲にクランプ
        const clampedValue = Math.max(0, Math.min(255, Math.floor(value)));
        this.gridData[index] = clampedValue;
        
        if (this.config.debug) {
            console.log(`[POKE] (${x},${y}) -> [${index}] = ${clampedValue}`);
        }
    }

    /**
     * LOG関数の実装
     * WorkerScriptの仕様に従い、改行は自動追加しない（/で明示的に指定）
     */
    private log(...args: any[]): void {
        const message = args.map(arg => String(arg)).join(' ');
        this.transcript.push(message);
        // 改行しないようにprocess.stdout.write()を使用
        process.stdout.write(message);
    }

    /**
     * 実行結果を表示
     */
    private displayResults(): void {
        // グリッドの表示
        this.displayGrid();
        
        // 出力ファイルに保存
        if (this.config.outputFile) {
            this.saveToFile();
        }
    }

    /**
     * グリッドをASCII文字で表示
     */
    private displayGrid(): void {
        console.log('\n📊 グリッド状態:');
        const rendered = this.gridRenderer.renderToString(this.gridData);
        console.log(rendered);
    }

    /**
     * 結果をファイルに保存
     */
    private saveToFile(): void {
        if (!this.config.outputFile) return;

        const output = {
            timestamp: new Date().toISOString(),
            transcript: this.transcript,
            grid: this.gridRenderer.renderToString(this.gridData)
        };

        fs.writeFileSync(this.config.outputFile, JSON.stringify(output, null, 2));
        console.log(`💾 結果を保存しました: ${this.config.outputFile}`);
    }

    /**
     * インタラクティブモードのヘルプ
     */
    private showInteractiveHelp(): void {
        console.log(`
📚 インタラクティブモード コマンド:
  .exit      インタラクティブモードを終了
  .clear     グリッドとトランスクリプトをクリア
  .grid      現在のグリッド状態を表示
  .help      このヘルプを表示

WorkerScript 構文例:
  A=10       変数Aに10を代入
  ?=A        変数Aの値を出力
  X=5 Y=10   座標を設定
  $=1        現在座標にピクセルを設定
  A=$        現在座標の値を読み取り
  /          改行出力
`);
    }
}