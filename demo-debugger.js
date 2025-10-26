#!/usr/bin/env node

// シンプルなデバッグ機能のデモンストレーション

class SimpleDebugDemo {
    constructor() {
        // 簡易的なWorkerInterpreterの動作シミュレーション
        this.currentLine = 0;
        this.variables = new Map();
        this.breakpoints = new Set();
        this.mode = 'run';
        this.lines = [
            '0  A=10',
            '1  B=20', 
            '2  ^LOOP',
            '3  A=A+1',
            '4  B=B-1',
            '5  !(A)',
            '6  IF A<15 GOTO ^LOOP',
            '7  !(B)',
            '8  HALT'
        ];
    }

    setBreakpoint(line) {
        this.breakpoints.add(line);
        console.log(`✓ ブレークポイント設定: 行${line}`);
    }

    removeBreakpoint(line) {
        this.breakpoints.delete(line);
        console.log(`✓ ブレークポイント削除: 行${line}`);
    }

    shouldBreak() {
        if (this.breakpoints.has(this.currentLine)) {
            this.mode = 'break';
            return true;
        }
        
        if (this.mode === 'step-in') {
            this.mode = 'break';
            return true;
        }
        
        return this.mode === 'break';
    }

    stepIn() {
        this.mode = 'step-in';
        console.log('→ ステップイン実行');
    }

    continue() {
        this.mode = 'run';
        console.log('→ 続行');
    }

    showState() {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📍 現在行: ${this.currentLine}`);
        console.log(`📝 コード: ${this.lines[this.currentLine] || '(終了)'}`);
        console.log(`📊 モード: ${this.mode}`);
        console.log(`🔴 ブレークポイント: [${Array.from(this.breakpoints).join(', ')}]`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }

    demo() {
        console.log('\n╔═══════════════════════════════════════════╗');
        console.log('║  ブレークポイント＆ステップ実行デモ    ║');
        console.log('╚═══════════════════════════════════════════╝\n');

        // 初期状態
        this.showState();

        // ステップ1: ブレークポイント設定
        console.log('【ステップ1】行3にブレークポイントを設定');
        this.setBreakpoint(3);
        console.log('');

        // ステップ2: 実行開始
        console.log('【ステップ2】実行開始（ブレークポイントまで）');
        this.currentLine = 0;
        while (this.currentLine < 3) {
            this.currentLine++;
        }
        this.mode = 'break';
        this.showState();

        // ステップ3: ステップイン
        console.log('【ステップ3】ステップイン実行');
        this.stepIn();
        this.currentLine++;
        this.showState();

        // ステップ4: もう一度ステップイン
        console.log('【ステップ4】さらにステップイン実行');
        this.stepIn();
        this.currentLine++;
        this.showState();

        // ステップ5: 続行
        console.log('【ステップ5】続行（次のブレークポイントまで）');
        this.continue();
        // ループで行3に戻る（実際にはGOTOで）
        this.currentLine = 3;
        this.mode = 'break';
        this.showState();

        console.log('【デモ完了】\n');
        console.log('💡 実際の使用方法:');
        console.log('   - interpreter.setBreakpoint(lineNumber)');
        console.log('   - interpreter.stepIn()');
        console.log('   - interpreter.stepOver()');
        console.log('   - interpreter.stepOut()');
        console.log('   - interpreter.continue()');
        console.log('   - interpreter.getCurrentLine()');
        console.log('   - interpreter.getVariables()');
        console.log('   - interpreter.getDebugMode()');
        console.log('');
    }
}

// デモ実行
const demo = new SimpleDebugDemo();
demo.demo();
