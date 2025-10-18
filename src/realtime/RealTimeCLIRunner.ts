// src/realtime/RealTimeCLIRunner.ts - リアルタイムCLI実行

import WorkerInterpreter from '../workerInterpreter.js';
import { GridRenderer } from '../gridRenderer.js';
import { KeyboardInput } from './KeyboardInput.js';

export interface RealTimeCLIRunnerConfig {
    debug?: boolean;
    verbose?: boolean;
    frameRate?: number;        // FPS（デフォルト: 30）
    stepsPerFrame?: number;    // 1フレームあたりの実行ステップ数（デフォルト: 1000）
    showFPS?: boolean;         // FPS表示（デフォルト: false）
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
    private keyboard: KeyboardInput;
    private transcript: string[] = [];
    private shouldStop: boolean = false;
    private totalSteps: number = 0;
    private frameCount: number = 0;
    private lastFPSDisplay: number = 0;

    constructor(config: RealTimeCLIRunnerConfig = {}) {
        this.config = {
            debug: config.debug ?? false,
            verbose: config.verbose ?? false,
            frameRate: config.frameRate ?? 30,
            stepsPerFrame: config.stepsPerFrame ?? 1000,
            showFPS: config.showFPS ?? false,
        };

        // 100x100 グリッドを初期化
        this.gridData = new Array(10000).fill(0);
        this.gridRenderer = new GridRenderer(100, 100);
        
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
            console.log(`🎮 リアルタイムモード起動: ${scriptName || 'Unknown'}`);
            console.log(`📊 設定: ${this.config.frameRate} FPS, ${this.config.stepsPerFrame} steps/frame`);
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
                console.log('⌨️  キーボード入力有効（Ctrl+Cで終了）\n');
            }

            // WorkerInterpreterを設定
            const interpreter = new WorkerInterpreter({
                gridData: this.gridData,
                peekFn: (index: number) => this.peek(index),
                pokeFn: (x: number, y: number, value: number) => this.poke(x, y, value),
                logFn: (...args: any[]) => this.log(...args),
                getFn: () => this.keyboard.getKey(), // ← リアルタイム入力
                putFn: (value: number) => this.put1Byte(value),
            });

            // スクリプトをロード
            interpreter.loadScript(script);

            if (this.config.verbose) {
                console.log('✅ スクリプト解析完了');
                console.log('🚀 実行開始...\n');
            }

            // 実行ジェネレーター取得
            const generator = interpreter.run();

            // リアルタイム実行ループ
            await this.runFrameLoop(generator);

            if (this.config.verbose) {
                console.log(`\n✅ 実行完了`);
                console.log(`📊 総実行: ${this.totalSteps.toLocaleString()} ステップ, ${this.frameCount} フレーム`);
            }

            // 結果を表示
            this.displayResults();

        } catch (error) {
            console.error('\n❌ 実行エラー:', error instanceof Error ? error.message : error);
            if (this.config.debug && error instanceof Error) {
                console.error('スタックトレース:', error.stack);
            }
        } finally {
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

            // FPS表示（1秒ごと）
            if (this.config.showFPS) {
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
     * ログ出力
     */
    private log(...args: any[]): void {
        const message = args.join(' ');
        this.transcript.push(message);
        console.log(message);
    }

    /**
     * 1byte出力
     */
    private put1Byte(value: number): void {
        // 0-255の範囲にクランプ
        const byte = Math.max(0, Math.min(255, Math.floor(value)));
        process.stdout.write(String.fromCharCode(byte));
    }

    /**
     * 結果表示
     */
    private displayResults(): void {
        if (this.config.verbose) {
            console.log('\n' + '='.repeat(50));
            console.log('📊 実行結果');
            console.log('='.repeat(50));
            
            // グリッド描画
            console.log('\n🔲 グリッド状態:');
            console.log(this.gridRenderer.renderToString(this.gridData, true));
            
            // トランスクリプト
            if (this.transcript.length > 0) {
                console.log('\n📝 トランスクリプト:');
                this.transcript.forEach(line => console.log(line));
            }
        }
    }
}
