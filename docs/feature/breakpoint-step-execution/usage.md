# ブレークポイントとステップ実行機能の使用方法

## 概要

WorkerInterpreterに実装されたデバッグ機能により、スクリプトの実行を制御し、変数の状態を確認できます。

## 基本的な使い方

### 1. インタプリタのセットアップ

```typescript
import WorkerInterpreter from './workerInterpreter.js';

const interpreter = new WorkerInterpreter({
    gridData,
    peekFn,
    pokeFn,
    logFn
});

interpreter.loadScript(script);
```

### 2. ブレークポイントの設定

```typescript
// 行3にブレークポイントを設定
interpreter.setBreakpoint(3);

// 行5と行10にもブレークポイントを設定
interpreter.setBreakpoint(5);
interpreter.setBreakpoint(10);

// 設定されているブレークポイントを確認
console.log(interpreter.getBreakpoints()); // [3, 5, 10]

// 特定のブレークポイントを削除
interpreter.removeBreakpoint(5);

// すべてのブレークポイントをクリア
interpreter.clearBreakpoints();
```

### 3. 実行制御

```typescript
const gen = interpreter.run();

// 次のブレークポイントまで実行
interpreter.continue();
let result = gen.next();

// ブレークポイントで停止したかチェック
while (!result.done) {
    if (interpreter.getDebugMode() === 'break') {
        console.log('ブレークポイントで停止');
        break;
    }
    result = gen.next();
}
```

### 4. ステップ実行

#### ステップイン（次のステートメントを実行）

```typescript
// サブルーチン内にも入る
interpreter.stepIn();
gen.next();
```

#### ステップオーバー（次のステートメントを実行、サブルーチンはスキップ）

```typescript
// サブルーチン呼び出しを一気に実行
interpreter.stepOver();
gen.next();
```

#### ステップアウト（サブルーチンから抜ける）

```typescript
// 現在のサブルーチンから抜けるまで実行
interpreter.stepOut();
while (!result.done && interpreter.getDebugMode() !== 'break') {
    result = gen.next();
}
```

### 5. デバッグ情報の取得

```typescript
// 現在の行番号
const currentLine = interpreter.getCurrentLine();

// すべての変数の状態
const variables = interpreter.getVariables();
console.log('A =', variables.get('A'));

// 特定の変数の値
const aValue = interpreter.getVariable('A');

// コールスタック
const callStack = interpreter.getCallStack();

// デバッグモード
const mode = interpreter.getDebugMode(); // 'run' | 'break' | 'step-over' | 'step-in' | 'step-out'
```

## 完全な使用例

```typescript
import WorkerInterpreter from './workerInterpreter.js';

// インタプリタのセットアップ
const gridData = new Array(10000).fill(0);
const peekFn = (index: number) => gridData[index] ?? 0;
const pokeFn = (x: number, y: number, value: number) => {
    gridData[y * 100 + x] = value;
};
const logFn = (...args: any[]) => console.log(...args);

const interpreter = new WorkerInterpreter({
    gridData,
    peekFn,
    pokeFn,
    logFn
});

// スクリプトをロード
const script = `
0  A=0
1  ^LOOP
2  A=A+1
3  !(A)
4  IF A<10 GOTO ^LOOP
5  HALT
`;
interpreter.loadScript(script);

// 行2にブレークポイントを設定
interpreter.setBreakpoint(2);

// 実行開始
const gen = interpreter.run();
let result = gen.next();

// デバッグループ
while (!result.done) {
    const mode = interpreter.getDebugMode();
    
    if (mode === 'break') {
        const line = interpreter.getCurrentLine();
        const vars = interpreter.getVariables();
        
        console.log(`\n=== ブレーク at Line ${line} ===`);
        console.log('Variables:', Object.fromEntries(vars));
        
        // ユーザー入力を待つ（実際のデバッガでは）
        // ここでは自動的にステップインを実行
        interpreter.stepIn();
    }
    
    result = gen.next();
}

console.log('\n実行完了');
```

## デバッグモードの状態遷移

```
run (通常実行)
  ↓ ブレークポイント到達
break (停止中)
  ↓ stepIn() / stepOver() / stepOut() / continue()
step-in / step-over / step-out / run
  ↓ 次のステップ完了
break (停止中)
```

## 注意事項

1. **行ベースの実装**: ブレークポイントは行単位で設定されます。同じ行内の複数のステートメントを個別にブレークすることはできません。

2. **GOSUB/RETURNの扱い**: コールスタックは行番号ベースで管理されます。ステップオーバーとステップアウトはこのコールスタックの深さを基準に動作します。

3. **ループ内のブレークポイント**: ループ内にブレークポイントを設定した場合、ループの各反復で停止します。

4. **Generator の特性**: インタプリタはgenerator関数として実装されているため、`next()`呼び出しごとに制御が返されます。ブレーク中も`next()`を呼び出し続ける必要があります（デバッグモードが'break'の間は進まない）。

## 統合例（デバッガUI付き）

実際のデバッガUIと統合する場合の例:

```typescript
class Debugger {
    private interpreter: WorkerInterpreter;
    private generator: Generator<void, void, void> | null = null;
    
    constructor(interpreter: WorkerInterpreter) {
        this.interpreter = interpreter;
    }
    
    start(script: string) {
        this.interpreter.loadScript(script);
        this.generator = this.interpreter.run();
    }
    
    // ブレークポイントトグル
    toggleBreakpoint(line: number) {
        const breakpoints = this.interpreter.getBreakpoints();
        if (breakpoints.includes(line)) {
            this.interpreter.removeBreakpoint(line);
        } else {
            this.interpreter.setBreakpoint(line);
        }
    }
    
    // 実行制御
    continue() {
        if (!this.generator) return;
        this.interpreter.continue();
        this.runUntilBreak();
    }
    
    stepIn() {
        if (!this.generator) return;
        this.interpreter.stepIn();
        this.generator.next();
        this.updateUI();
    }
    
    stepOver() {
        if (!this.generator) return;
        this.interpreter.stepOver();
        this.runUntilBreak();
    }
    
    stepOut() {
        if (!this.generator) return;
        this.interpreter.stepOut();
        this.runUntilBreak();
    }
    
    private runUntilBreak() {
        if (!this.generator) return;
        
        let result = this.generator.next();
        while (!result.done) {
            if (this.interpreter.getDebugMode() === 'break') {
                this.updateUI();
                break;
            }
            result = this.generator.next();
        }
        
        if (result.done) {
            this.onComplete();
        }
    }
    
    private updateUI() {
        // UIを更新
        const line = this.interpreter.getCurrentLine();
        const vars = this.interpreter.getVariables();
        const stack = this.interpreter.getCallStack();
        
        console.log('Current Line:', line);
        console.log('Variables:', Object.fromEntries(vars));
        console.log('Call Stack:', stack);
    }
    
    private onComplete() {
        console.log('実行完了');
    }
}
```

## API リファレンス

### ブレークポイント管理

- `setBreakpoint(lineNumber: number): void` - ブレークポイントを設定
- `removeBreakpoint(lineNumber: number): void` - ブレークポイントを削除
- `clearBreakpoints(): void` - すべてのブレークポイントをクリア
- `getBreakpoints(): number[]` - ブレークポイント一覧を取得

### 実行制御

- `continue(): void` - 次のブレークポイントまで実行
- `stepIn(): void` - 次のステートメントを実行（サブルーチン内も）
- `stepOver(): void` - 次のステートメントを実行（サブルーチンはスキップ）
- `stepOut(): void` - サブルーチンから抜ける

### デバッグ情報

- `getCurrentLine(): number` - 現在の行番号を取得
- `getVariable(name: string): number` - 特定の変数の値を取得
- `getVariables(): Map<string, number>` - すべての変数を取得
- `getCallStack(): number[]` - コールスタックを取得
- `getDebugMode(): DebugMode` - 現在のデバッグモードを取得
