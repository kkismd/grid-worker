# Web環境での入力機能設計

**作成日**: 2025年10月21日  
**対象**: WorkerScript Web版における`A=?`（数値入力）と`A=$`（1文字入力）の実装

---

## 現状分析

### 既存実装（`A=$`）

**実装済み**: ✅ キーボードイベントベースの1文字入力
- **グローバルキーキュー**: `keyQueue: number[]`
- **キーボードリスナー**: `document.addEventListener('keydown')`
- **getFn実装**: `getKeyInput()` - キューからFIFOで取得
- **動作**: ユーザーがキーを押すとキューに追加、`A=$`で取得

```typescript
// 現在の実装（src/index.ts）
function getKeyInput(): number {
    if (keyQueue.length > 0) {
        const key = keyQueue.shift()!;
        updateKeyboardStatus();
        return key;
    }
    return 0; // 何も押されていない場合
}
```

### 未実装（`A=?`）

**状態**: ❌ 数値入力機能なし
- `getLineFn`は`WorkerInterpreter`に渡されていない
- Web UIに入力ダイアログやテキストフィールドがない

---

## 設計の選択肢

### Option 1: プロンプトダイアログ（シンプル） ⭐

**概要**: `window.prompt()`を使用

**長所**:
- ✅ 実装が非常に簡単（5-10行）
- ✅ ブラウザ標準機能、依存なし
- ✅ ユーザーフレンドリー（明確な入力フォーム）

**短所**:
- ⚠️ モーダルダイアログ（スクリプト実行がブロック）
- ⚠️ スタイリングができない
- ⚠️ Generator関数の非同期処理が必要

**実装例**:
```typescript
function getLineInput(): string {
    const input = window.prompt('Enter a number:');
    return input ?? '';
}

// WorkerInterpreterに渡す
new WorkerInterpreter({
    // ...
    getLineFn: getLineInput,
});
```

**課題**: Generator関数内で`prompt()`を呼ぶとブロックするため、`A=?`実行時に一時停止する必要がある。

---

### Option 2: インラインテキストフィールド（推奨） ⭐⭐⭐

**概要**: 各Workerカードに入力フィールドを追加

**長所**:
- ✅ 非ブロッキング（スクリプト実行と並行可能）
- ✅ 柔軟なスタイリング
- ✅ 入力履歴の表示が可能
- ✅ 複数ワーカーの独立した入力管理

**短所**:
- ⚠️ 実装が複雑（30-50行）
- ⚠️ UIの変更が必要

**実装概要**:
1. 各Workerカードに入力フィールドとバッファを追加
2. `Enter`キーで入力を確定し、バッファに格納
3. `getLineFn`はバッファから取得（なければ空文字列）

**HTML構造**:
```html
<div class="worker-card">
    <textarea class="script-editor"></textarea>
    <div class="input-section">
        <input type="text" class="number-input" placeholder="Enter number (press Enter)">
        <div class="input-buffer">Buffer: (empty)</div>
    </div>
    <div class="transcript"></div>
</div>
```

**TypeScript実装**:
```typescript
interface Worker {
    // ...
    inputBuffer: string[]; // 入力バッファ（FIFO）
}

function setupInputField(workerId: number) {
    const input = document.querySelector(`#input-${workerId}`) as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const worker = workers.get(workerId);
            if (worker) {
                worker.inputBuffer.push(input.value);
                updateInputBufferDisplay(workerId);
                input.value = '';
            }
        }
    });
}

function getLineInput(workerId: number): string {
    const worker = workers.get(workerId);
    if (!worker || worker.inputBuffer.length === 0) {
        return ''; // バッファが空なら空文字列
    }
    const line = worker.inputBuffer.shift()!;
    updateInputBufferDisplay(workerId);
    return line;
}
```

---

### Option 3: 事前入力方式（デバッグ向け）

**概要**: スクリプト実行前に入力データを配列で設定

**長所**:
- ✅ テスト・デバッグに最適
- ✅ 非ブロッキング
- ✅ 実装が簡単

**短所**:
- ❌ インタラクティブ性がない
- ❌ 動的な入力ができない

**実装例**:
```typescript
// UI: 事前入力データ設定
<textarea id="input-data-${workerId}" placeholder="10\n20\n30"></textarea>

// 実行時
const inputLines = inputDataTextarea.value.split('\n');
let inputIndex = 0;

function getLineInput(): string {
    if (inputIndex < inputLines.length) {
        return inputLines[inputIndex++];
    }
    return '0'; // デフォルト値
}
```

---

## 推奨アプローチ

### Phase 1: インラインテキストフィールド実装 ⭐⭐⭐

**理由**:
1. **非ブロッキング**: スクリプト実行を妨げない
2. **マルチワーカー対応**: 各ワーカーが独立した入力を持つ
3. **ユーザー体験**: 直感的で柔軟
4. **拡張性**: 入力履歴、バリデーション、オートコンプリートなど追加可能

**実装ステップ**:

1. **HTMLテンプレート更新** (src/index.ts - createWorkerCard)
   - 入力フィールド追加
   - バッファ表示エリア追加

2. **Workerインターフェース拡張**
   ```typescript
   interface Worker {
       // ...
       inputBuffer: string[];
   }
   ```

3. **入力イベントハンドラ**
   - `Enter`キーでバッファに追加
   - バッファ表示を更新

4. **getLineFn実装**
   - ワーカーIDをクロージャで保持
   - バッファからFIFOで取得

5. **WorkerInterpreterに渡す**
   ```typescript
   new WorkerInterpreter({
       // ...
       getLineFn: () => getLineInput(workerId),
   });
   ```

### Phase 2: プロンプトダイアログ対応（オプション）

デバッグや簡易実行用に`--use-prompt`フラグを追加し、`window.prompt()`を使用する方式も併用可能。

---

## 動作フロー（Phase 1実装時）

### ユーザーの操作

1. ワーカーのスクリプトエディタに入力:
   ```workerscript
   ?="Enter your age: "
   A=?
   ?="You are " ?=A ?=" years old" /
   ```

2. スクリプトを実行（Startボタン）

3. トランスクリプトに「Enter your age: 」が表示される

4. 入力フィールドに「25」と入力し`Enter`

5. バッファ表示: `Buffer: 1 input waiting`

6. スクリプトが`A=?`を実行
   - バッファから「25」を取得
   - `A`に25が代入
   - バッファ表示: `Buffer: (empty)`

7. トランスクリプトに「You are 25 years old」が表示される

### エッジケース処理

**バッファが空の場合**:
- `getLineFn()`は空文字列`""`を返す
- `evaluateInputNumberExpression()`は`0`に変換

**複数入力の場合**:
```workerscript
A=?
B=?
C=A+B
?=C
```
- ユーザーが「10」`Enter`、「20」`Enter`と入力
- バッファ: `["10", "20"]`
- `A=?`で「10」、`B=?`で「20」を取得
- `C`に30が代入

---

## セキュリティとバリデーション

### 入力値のサニタイゼーション

**現在の実装**:
```typescript
// evaluateInputNumberExpression (workerInterpreter.ts)
const value = parseInt(line.trim(), 10);
if (isNaN(value)) {
    return 0;
}
return (value << 16) >> 16; // 16ビットラップアラウンド
```

**追加検討事項**:
- ✅ `trim()`で空白除去済み
- ✅ `parseInt()`で非数値は`NaN`
- ✅ `NaN`は`0`に変換
- ⚠️ HTML特殊文字のエスケープ（トランスクリプト表示時）

**HTMLエスケープ**:
```typescript
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

---

## テスト計画

### 単体テスト（Jest）

既存のモックテストで十分（17個実装済み）:
- ✅ 正常な数値入力
- ✅ 負の数値
- ✅ 空文字列
- ✅ 非数値文字列
- ✅ 16ビットラップアラウンド

### 統合テスト（手動）

1. **基本入力**:
   - スクリプト: `A=? ?=A`
   - 入力: `42`
   - 期待: トランスクリプトに`42`

2. **複数入力**:
   - スクリプト: `A=? B=? ?=A+B`
   - 入力: `10`, `20`
   - 期待: トランスクリプトに`30`

3. **エラーハンドリング**:
   - スクリプト: `A=? ?=A`
   - 入力: `abc`
   - 期待: トランスクリプトに`0`

4. **バッファ管理**:
   - 事前に3つ入力
   - スクリプトで2つ消費
   - 期待: バッファ表示`1 input waiting`

---

## 実装見積もり

### Phase 1: インラインテキストフィールド

**作業内容**:
1. HTML/CSSの追加 (30分)
2. Workerインターフェース拡張 (10分)
3. イベントハンドラ実装 (30分)
4. getLineFn実装 (20分)
5. WorkerInterpreterへの統合 (10分)
6. 手動テスト (30分)

**合計**: 約2-2.5時間

### Phase 2: プロンプトダイアログ（オプション）

**作業内容**:
1. フラグ追加 (10分)
2. prompt()実装 (10分)
3. テスト (10分)

**合計**: 約30分

---

## 次のステップ

1. **Phase 1実装を開始**
2. 手動テストで動作確認
3. ドキュメント更新（README.mdに使用例追加）
4. （オプション）Phase 2実装

---

## 参考: 既存の1文字入力実装

```typescript
// キーキューの初期化
const keyQueue: number[] = [];

// キーボードイベントリスナー
document.addEventListener('keydown', (e) => {
    const keyCode = e.key.length === 1 ? e.key.charCodeAt(0) : 0;
    if (keyCode > 0) {
        keyQueue.push(keyCode);
        updateKeyboardStatus();
    }
});

// getFn実装
function getKeyInput(): number {
    if (keyQueue.length > 0) {
        const key = keyQueue.shift()!;
        updateKeyboardStatus();
        return key;
    }
    return 0;
}

// WorkerInterpreterに渡す
new WorkerInterpreter({
    // ...
    getFn: getKeyInput,
});
```

この設計を参考に、`getLineFn`も同様のパターンで実装可能。
