/**
 * KeyboardInput - ノンブロッキングキーボード入力管理
 * 
 * WorkerScriptのリアルタイム機能の核となるクラス。
 * Raw Modeでのキー入力を安全に管理し、K=$システム変数に値を提供する。
 */

export interface KeyboardInputOptions {
    /** バッファの最大サイズ（デフォルト: 1000） */
    maxBufferSize?: number;
    /** デバッグ出力を有効にする */
    debug?: boolean;
    /** 終了時のクリーンアップコールバック */
    onCleanup?: () => void;
}

export class KeyboardInput {
    private keyBuffer: number[] = [];
    private isEnabled: boolean = false;
    private maxBufferSize: number;
    private debug: boolean;
    private keyPressHandler: ((data: string) => void) | null = null;
    private sigintHandler: (() => void) | null = null;
    private exitHandler: (() => void) | null = null;
    private cleanupCallback?: () => void;

    constructor(options: KeyboardInputOptions = {}) {
        this.maxBufferSize = options.maxBufferSize ?? 1000;
        this.debug = options.debug ?? false;
        this.cleanupCallback = options.onCleanup;
    }

    /**
     * Raw Modeを有効にしてキー入力の監視を開始
     * @throws TTY環境でない場合はエラー
     */
    enable(): void {
        if (this.isEnabled) {
            if (this.debug) console.log('[KeyboardInput] Already enabled');
            return;
        }

        // TTYチェック
        if (!process.stdin.isTTY) {
            throw new Error('KeyboardInput requires a TTY environment');
        }

        // Raw Mode有効化
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        // キー入力ハンドラー設定
        this.keyPressHandler = this.handleKeyPress.bind(this);
        process.stdin.on('data', this.keyPressHandler);

        // 終了ハンドラー設定
        this.setupExitHandlers();

        this.isEnabled = true;
        if (this.debug) console.log('[KeyboardInput] Enabled (Raw Mode)');
    }

    /**
     * Raw Modeを無効にしてキー入力の監視を停止
     */
    disable(): void {
        if (!this.isEnabled) {
            return;
        }

        // イベントハンドラー削除
        if (this.keyPressHandler) {
            process.stdin.off('data', this.keyPressHandler);
            this.keyPressHandler = null;
        }

        // シグナルハンドラー削除
        if (this.sigintHandler) {
            process.off('SIGINT', this.sigintHandler);
            this.sigintHandler = null;
        }

        if (this.exitHandler) {
            process.off('exit', this.exitHandler);
            this.exitHandler = null;
        }

        // Raw Mode無効化（端末モードを元に戻す）
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
            process.stdin.pause();
        }

        this.isEnabled = false;
        if (this.debug) console.log('[KeyboardInput] Disabled');
    }

    /**
     * K=$ の実装: 次のキー入力を取得（なければ0）
     * @returns キーコード (0-255) または 0 (入力なし)
     */
    getKey(): number {
        const key = this.keyBuffer.shift() || 0;
        if (this.debug && key > 0) {
            console.log(`[KeyboardInput] getKey() -> ${key} (${String.fromCharCode(key)})`);
        }
        return key;
    }

    /**
     * バッファ内のキー数を取得
     */
    getBufferSize(): number {
        return this.keyBuffer.length;
    }

    /**
     * バッファをクリア
     */
    clearBuffer(): void {
        this.keyBuffer = [];
        if (this.debug) console.log('[KeyboardInput] Buffer cleared');
    }

    /**
     * 有効状態を取得
     */
    isActive(): boolean {
        return this.isEnabled;
    }

    /**
     * キー入力を処理
     */
    private handleKeyPress(data: string): void {
        // 各文字のキーコードをバッファに追加
        for (let i = 0; i < data.length; i++) {
            const keyCode = data.charCodeAt(i);

            // Ctrl+C (ASCII 3) は特別処理
            if (keyCode === 3) {
                this.handleCtrlC();
                return;
            }

            // バッファに追加
            this.keyBuffer.push(keyCode);

            // バッファサイズ制限
            if (this.keyBuffer.length > this.maxBufferSize) {
                this.keyBuffer.shift(); // 古いキーを削除
                if (this.debug) {
                    console.log('[KeyboardInput] Buffer overflow, oldest key removed');
                }
            }

            if (this.debug) {
                console.log(`[KeyboardInput] Key pressed: ${keyCode} (${data[i]})`);
            }
        }
    }

    /**
     * Ctrl+C ハンドリング
     */
    private handleCtrlC(): void {
        if (this.debug) console.log('[KeyboardInput] Ctrl+C detected');
        this.gracefulExit();
    }

    /**
     * 終了ハンドラーを設定
     */
    private setupExitHandlers(): void {
        // SIGINT (Ctrl+C) - 新しいハンドラーを作成して保存
        this.sigintHandler = () => {
            this.gracefulExit();
        };
        process.on('SIGINT', this.sigintHandler);

        // プロセス終了時 - 新しいハンドラーを作成して保存
        this.exitHandler = () => {
            this.disable();
        };
        process.on('exit', this.exitHandler);
    }

    /**
     * 安全に終了
     */
    private gracefulExit(): void {
        // クリーンアップコールバックを実行（カーソル表示など）
        if (this.cleanupCallback) {
            try {
                this.cleanupCallback();
            } catch (error) {
                if (this.debug) {
                    console.error('[KeyboardInput] Cleanup callback error:', error);
                }
            }
        }
        
        this.disable();
        console.log('\n[KeyboardInput] Exiting...');
        process.exit(0);
    }
}

/**
 * シングルトンインスタンス（オプション）
 */
let globalKeyboardInput: KeyboardInput | null = null;

export function getGlobalKeyboardInput(options?: KeyboardInputOptions): KeyboardInput {
    if (!globalKeyboardInput) {
        globalKeyboardInput = new KeyboardInput(options);
    }
    return globalKeyboardInput;
}

export function resetGlobalKeyboardInput(): void {
    if (globalKeyboardInput) {
        globalKeyboardInput.disable();
        globalKeyboardInput = null;
    }
}
