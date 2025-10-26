# ブレークポイントとステップ実行機能の設計

## 概要

WorkerInterpreterがgenerator関数として実装されているため、各ステートメント実行後にyieldで制御を返している。この特性を活かして、ブレークポイントとステップ実行機能を実装する。

## 機能要件

### 1. ブレークポイント機能
- 特定の行番号にブレークポイントを設定できる
- ブレークポイントに到達したら実行を一時停止する
- 複数のブレークポイントを設定できる
- ブレークポイントの追加・削除が可能

### 2. ステップ実行機能
- **ステップオーバー**: 次のステートメントを実行（関数/サブルーチンはスキップ）
- **ステップイン**: 次のステートメントを実行（関数/サブルーチン内に入る）
- **ステップアウト**: 現在のサブルーチンから抜けるまで実行
- **続行**: 次のブレークポイントまで実行を続ける

### 3. デバッグ情報
- 現在の行番号
- 現在の変数状態
- コールスタックの状態
- 実行モード（通常実行/ブレーク中/ステップ実行中）

## 実装方針

### デバッグコンテキスト

```typescript
interface DebugContext {
    mode: 'run' | 'break' | 'step-over' | 'step-in' | 'step-out';
    breakpoints: Set<number>;           // ブレークポイントの行番号
    currentLine: number;                // 現在実行中の行番号
    stepTargetDepth?: number;           // ステップアウト用のコールスタック深さ
}
```

### Generator拡張

既存の`run()`メソッドと`executeStatements()`メソッドに、ブレークポイントチェックとステップ実行制御を追加する。

### API設計

```typescript
// ブレークポイント管理
setBreakpoint(lineNumber: number): void
removeBreakpoint(lineNumber: number): void
clearBreakpoints(): void
getBreakpoints(): number[]

// 実行制御
continue(): void      // 次のブレークポイントまで実行
stepOver(): void      // 次のステートメントを実行
stepIn(): void        // 次のステートメント（サブルーチン内も含む）を実行
stepOut(): void       // 現在のサブルーチンから抜ける

// デバッグ情報取得
getCurrentLine(): number
getVariables(): Map<string, number>
getCallStack(): number[]
getDebugMode(): string
```

## 実装の詳細

### ブレークポイントチェック

各行の実行前に、現在の行がブレークポイントに設定されているかチェックする。ブレークポイントの場合、デバッグモードを'break'に設定し、yieldで制御を返す。

### ステップ実行制御

- **ステップオーバー**: 現在のコールスタック深さを記録し、同じ深さで次のステートメントに到達するまで実行
- **ステップイン**: 常に次のyieldポイントで停止
- **ステップアウト**: コールスタック深さが浅くなるまで実行

### Generator連携

generatorの`next()`呼び出し時に、デバッグコンテキストに応じて実行を制御する。外部からは通常のgenerator操作で制御できる。
