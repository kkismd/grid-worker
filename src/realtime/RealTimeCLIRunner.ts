// src/realtime/RealTimeCLIRunner.ts - リアルタイムCLI実行

import WorkerInterpreter from '../workerInterpreter.js';
import { GridRenderer } from '../gridRenderer.js';
import { KeyboardInput } from './KeyboardInput.js';
import { GridDiffRenderer } from './GridDiffRenderer.js';
import { SplitScreenRenderer } from './SplitScreenRenderer.js';

export interface RealTimeCLIRunnerConfig {
    debug?: boolean;
    verbose?: boolean;
    frameRate?: number;        // FPS（デフォルト: 30）
    stepsPerFrame?: number;    // 1フレームあたりの実行ステップ数（デフォルト: 1000）
    showFPS?: boolean;         // FPS表示（デフォルト: false）
    showGrid?: boolean;        // グリッド表示（デフォルト: false）
    gridDisplaySize?: number;  // グリッド表示サイズ（デフォルト: 20x20）
    splitScreen?: boolean;     // 上下分割画面（デフォルト: false）
}

/**
 * リアルタイムCLI実行ランナー
 * 
 * フレームレート制御とキーボード入力を統合した実行環境。
 * ビジーループを避け、適切なCPU使用率でスクリプトを実行する。
 */
export class RealTimeCLIRunner {
    private config: Required<RealTimeCLIRunnerConfig>;
    private gridData: number[];
    private gridRenderer: GridRenderer;
    private gridDiffRenderer: GridDiffRenderer;
    private splitScreenRenderer?: SplitScreenRenderer;
    private keyboard: KeyboardInput;
    private transcript: string[] = [];
    private shouldStop: boolean = false;
    private totalSteps: number = 0;
    private frameCount: number = 0;
    private lastFPSDisplay: number = 0;
    private lastGridData: number[][] = [];

    constructor(config: RealTimeCLIRunnerConfig = {}) {
        this.config = {
            debug: config.debug ?? false,
            verbose: config.verbose ?? false,
            frameRate: config.frameRate ?? 30,
            stepsPerFrame: config.stepsPerFrame ?? 1000,
            showFPS: config.showFPS ?? false,
            showGrid: config.showGrid ?? false,
            gridDisplaySize: config.gridDisplaySize ?? 20,
            splitScreen: config.splitScreen ?? false,
        };

        // 100x100 グリッドを初期化
        this.gridData = new Array(10000).fill(0);
        this.gridRenderer = new GridRenderer(100, 100);
        
        // グリッド差分レンダラーを初期化
        this.gridDiffRenderer = new GridDiffRenderer(
            100, 
            100, 
            this.config.gridDisplaySize, 
            this.config.gridDisplaySize
        );
        
        // キーボード入力を初期化
        this.keyboard = new KeyboardInput({
            debug: this.config.debug,
            maxBufferSize: 1000,
        });
    }

    /**
     * リアルタイムモードでスクリプトを実行
     */
    async executeRealTime(script: string, scriptName?: string): Promise<void> {
        if (this.config.verbose) {
            this.println(`🎮 リアルタイムモード起動: ${scriptName || 'Unknown'}`);
            this.println(`📊 設定: ${this.config.frameRate} FPS, ${this.config.stepsPerFrame} steps/frame`);
        }

        // トランスクリプトをクリア
        this.transcript = [];
        this.shouldStop = false;
        this.totalSteps = 0;
        this.frameCount = 0;
        this.lastFPSDisplay = Date.now();

        try {
            // キーボード入力を有効化
            this.keyboard.enable();

            if (this.config.verbose) {
                this.println('⌨️  キーボード入力有効（Ctrl+Cで終了）\n');
            }

            // WorkerInterpreterを設定
            const interpreter = new WorkerInterpreter({
                gridData: this.gridData,
                peekFn: (index: number) => this.peek(index),
                pokeFn: (x: number, y: number, value: number) => this.poke(x, y, value),
                logFn: (...args: any[]) => this.print(...args),  // スクリプト出力
                getFn: () => this.keyboard.getKey(), // ← リアルタイム入力
                putFn: (value: number) => this.put1Byte(value),  // スクリプト出力
            });

            // スクリプトをロード
            interpreter.loadScript(script);

            if (this.config.verbose) {
                this.println('✅ スクリプト解析完了');
                this.println('🚀 実行開始...\n');
            }

            // グリッド表示の初期化
            if (this.config.showGrid) {
                if (this.config.splitScreen) {
                    // 上下分割画面レンダラーを初期化
                    this.splitScreenRenderer = new SplitScreenRenderer(
                        this.config.gridDisplaySize,
                        scriptName
                    );
                    // lastGridDataを初期化
                    this.lastGridData = this.getCurrentGridData();
                    process.stdout.write(this.splitScreenRenderer.initScreen());
                } else {
                    // 通常のグリッド表示
                    process.stdout.write(GridDiffRenderer.hideCursor());
                    process.stdout.write(this.gridDiffRenderer.initScreen());
                }
            }

            // 実行ジェネレーター取得
            const generator = interpreter.run();

            // リアルタイム実行ループ
            await this.runFrameLoop(generator);

            if (this.config.verbose) {
                this.println(`\n✅ 実行完了`);
                this.println(`📊 総実行: ${this.totalSteps.toLocaleString()} ステップ, ${this.frameCount} フレーム`);
            }

            // 結果を表示
            this.displayResults();

        } catch (error) {
            this.println('\n❌ 実行エラー:' + (error instanceof Error ? error.message : error));
            if (this.config.debug && error instanceof Error) {
                this.println('スタックトレース:' + error.stack);
            }
        } finally {
            // グリッド表示を終了
            if (this.config.showGrid) {
                if (this.config.splitScreen && this.splitScreenRenderer) {
                    // 上下分割画面のクリーンアップ
                    process.stdout.write(this.splitScreenRenderer.cleanup());
                } else {
                    // 通常グリッド表示のクリーンアップ
                    process.stdout.write(GridDiffRenderer.showCursor());
                    console.log('\n');  // グリッドの下に改行
                }
            }
            
            // キーボード入力を無効化
            this.keyboard.disable();
        }
    }

    /**
     * フレームループ実行
     */
    private async runFrameLoop(generator: Generator): Promise<void> {
        while (!this.shouldStop) {
            const frameStart = Date.now();
            
            // 1フレーム分実行（ステップ制限なし）
            let frameSteps = 0;
            for (let i = 0; i < this.config.stepsPerFrame; i++) {
                const result = generator.next();
                frameSteps++;
                this.totalSteps++;
                
                if (result.done) {
                    this.shouldStop = true;
                    break;
                }
            }
            
            this.frameCount++;

            // グリッド差分描画
            if (this.config.showGrid) {
                if (this.config.splitScreen && this.splitScreenRenderer) {
                    // 上下分割画面モード: グリッド領域のみ更新
                    const currentGrid = this.getCurrentGridData();
                    const diffOutput = this.splitScreenRenderer.updateGrid(this.lastGridData, currentGrid);
                    if (diffOutput) {
                        process.stdout.write(diffOutput);
                    }
                    this.lastGridData = currentGrid;
                } else {
                    // 通常グリッド表示
                    const diffOutput = this.gridDiffRenderer.renderDiff(this.gridData);
                    if (diffOutput) {
                        process.stdout.write(diffOutput);
                    }
                }
            }

            // FPS表示（1秒ごと）
            if (this.config.showFPS && !this.config.showGrid) {
                // showGrid有効時はFPS表示をグリッド下に配置するので、ここでは表示しない
                const now = Date.now();
                if (now - this.lastFPSDisplay >= 1000) {
                    const actualFPS = this.frameCount / ((now - this.lastFPSDisplay) / 1000);
                    process.stderr.write(`\r📊 FPS: ${actualFPS.toFixed(1)} | Steps: ${this.totalSteps.toLocaleString()}    `);
                    this.lastFPSDisplay = now;
                    this.frameCount = 0;
                }
            }

            // フレームレート制御
            const elapsed = Date.now() - frameStart;
            const targetFrameTime = 1000 / this.config.frameRate;
            const delay = Math.max(0, targetFrameTime - elapsed);
            
            if (delay > 0) {
                await this.sleep(delay);
            }
        }
    }

    /**
     * スリープ（非同期）
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 現在のグリッドデータを2次元配列に変換
     */
    private getCurrentGridData(): number[][] {
        const size = this.config.gridDisplaySize;
        const grid: number[][] = [];
        
        for (let y = 0; y < size; y++) {
            const row: number[] = [];
            for (let x = 0; x < size; x++) {
                const index = y * 100 + x;
                row.push(this.gridData[index] || 0);
            }
            grid.push(row);
        }
        
        return grid;
    }

    /**
     * PEEK実装
     */
    private peek(index: number): number {
        if (index < 0 || index >= this.gridData.length) {
            return 0;
        }
        return this.gridData[index] ?? 0;
    }

    /**
     * POKE実装
     */
    private poke(x: number, y: number, value: number): void {
        // X, Y を 0-99 の範囲にラップ
        const wrappedX = ((x % 100) + 100) % 100;
        const wrappedY = ((y % 100) + 100) % 100;
        const index = wrappedY * 100 + wrappedX;
        
        if (index >= 0 && index < this.gridData.length) {
            this.gridData[index] = value;
        }
    }

    /**
     * システムメッセージ出力（println）
     * デバッグログやシステム情報など、スクリプト出力とは分離
     */
    private println(...args: any[]): void {
        const message = args.join(' ');
        
        // 常にコンソールに出力（グリッド表示に影響されない）
        console.log(message);
    }

    /**
     * スクリプト出力（print）
     * ?= による出力。トランスクリプトに記録
     */
    private print(...args: any[]): void {
        const message = args.join(' ');
        this.transcript.push(message);
        
        // 上下分割画面モードではトランスクリプト領域に出力
        if (this.config.showGrid && this.config.splitScreen && this.splitScreenRenderer) {
            // 改行は含めない（NewlineStatementで別途処理される）
            this.splitScreenRenderer.addTranscriptLine(message);
        } else if (!this.config.showGrid) {
            // グリッド表示オフの場合は通常のコンソール出力
            // 改行なしで出力（従来の動作）
            process.stdout.write(String(message));
        }
        // showGrid=true, splitScreen=falseの場合は抑制（従来の動作）
    }

    /**
     * 1byte出力（/= による文字出力）
     */
    private put1Byte(value: number): void {
        // 0-255の範囲にクランプ
        const byte = Math.max(0, Math.min(255, Math.floor(value)));
        
        // 上下分割画面モードではトランスクリプト領域に出力
        if (this.config.showGrid && this.config.splitScreen && this.splitScreenRenderer) {
            this.splitScreenRenderer.addTranscriptChar(String.fromCharCode(byte));
        } else if (!this.config.showGrid) {
            // グリッド表示オフの場合は通常の出力
            process.stdout.write(String.fromCharCode(byte));
        }
        // showGrid=true, splitScreen=falseの場合は抑制（従来の動作）
    }

    /**
     * 結果表示
     */
    private displayResults(): void {
        if (this.config.verbose) {
            this.println('\n' + '='.repeat(50));
            this.println('📊 実行結果');
            this.println('='.repeat(50));
            
            // グリッド描画
            this.println('\n🔲 グリッド状態:');
            this.println(this.gridRenderer.renderToString(this.gridData, true));
            
            // トランスクリプト
            if (this.transcript.length > 0) {
                this.println('\n📝 トランスクリプト:');
                this.transcript.forEach(line => this.println(line));
            }
        }
    }
}
