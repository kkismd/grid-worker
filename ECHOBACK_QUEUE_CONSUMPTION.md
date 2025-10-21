# エコーバック方式の動作詳細

**作成日**: 2025年10月21日  
**確認**: エコーバックでキューを消化するかどうか

---

## 質問: エコーバックでキューを消化するか？

### ケースA: エコーバックでキューを消化する場合

```typescript
function getLineFromBuffer(buffer: string[]): LineInputResult {
    const newlineIndex = buffer.indexOf('\n');
    
    if (newlineIndex === -1) {
        // 改行がない → 入力途中
        // キューから取り出して返す（消化する）
        const value = buffer.splice(0, buffer.length).join('');  // ← キューを空にする
        return {
            complete: false,
            value: value  // "12"
        };
    }
    
    // 改行がある → 入力完了
    const line = buffer.splice(0, newlineIndex + 1).slice(0, -1).join('');
    return {
        complete: true,
        value: line
    };
}
```

**動作**:
```
初期状態: keyBuffer = []

ユーザーが '1' を入力
  keyBuffer = ['1']
  
フレーム1: A=?
  getLineFromBuffer(['1'])
    → { complete: false, value: '1' }
    → buffer.splice(0, 1) でキューを消化
    → keyBuffer = []  ← 空になる
  logFn('1') → "1" をエコー
  waitingForInput = true
  yield

ユーザーが '2' を入力
  keyBuffer = ['2']  ← 新しい入力

フレーム2: A=?（再実行）
  getLineFromBuffer(['2'])
    → { complete: false, value: '2' }
    → buffer.splice(0, 1) でキューを消化
    → keyBuffer = []
  logFn('2') → "2" をエコー
  waitingForInput = true
  yield

ユーザーが '3' を入力
  keyBuffer = ['3']

フレーム3: A=?（再実行）
  getLineFromBuffer(['3'])
    → { complete: false, value: '3' }
    → buffer.splice(0, 1) でキューを消化
    → keyBuffer = []
  logFn('3') → "3" をエコー
  waitingForInput = true
  yield

ユーザーが Enter を入力
  keyBuffer = ['\n']

フレーム4: A=?（再実行）
  getLineFromBuffer(['\n'])
    → newlineIndex = 0
    → { complete: true, value: '' }  ← 空文字列！
    → parseInt('') → NaN → 0
  A = 0  ← 間違った結果！
```

**問題**:
- ❌ 途中の文字（'1', '2', '3'）が失われる
- ❌ 最終的に0が返る
- ❌ 複数桁入力ができない

---

### ケースB: エコーバックでキューを消化しない場合

```typescript
function getLineFromBuffer(buffer: string[]): LineInputResult {
    const newlineIndex = buffer.indexOf('\n');
    
    if (newlineIndex === -1) {
        // 改行がない → 入力途中
        // キューから取り出さずに、読み取るだけ
        const value = buffer.join('');  // ← splice しない
        return {
            complete: false,
            value: value  // "12"
        };
    }
    
    // 改行がある → 入力完了
    const line = buffer.splice(0, newlineIndex + 1).slice(0, -1).join('');  // ← ここで消化
    return {
        complete: true,
        value: line
    };
}
```

**動作**:
```
初期状態: keyBuffer = []

ユーザーが '1' を入力
  keyBuffer = ['1']
  
フレーム1: A=?
  getLineFromBuffer(['1'])
    → buffer.join('') → '1'（spliceしない）
    → { complete: false, value: '1' }
    → keyBuffer = ['1']  ← 残る
  logFn('1') → "1" をエコー
  waitingForInput = true
  yield

ユーザーが '2' を入力
  keyBuffer = ['1', '2']  ← 蓄積される

フレーム2: A=?（再実行）
  getLineFromBuffer(['1', '2'])
    → buffer.join('') → '12'
    → { complete: false, value: '12' }
    → keyBuffer = ['1', '2']  ← 残る
  logFn('12') → "12" をエコー  ← 毎回同じ文字列を表示！
  waitingForInput = true
  yield

ユーザーが '3' を入力
  keyBuffer = ['1', '2', '3']

フレーム3: A=?（再実行）
  getLineFromBuffer(['1', '2', '3'])
    → buffer.join('') → '123'
    → { complete: false, value: '123' }
    → keyBuffer = ['1', '2', '3']  ← 残る
  logFn('123') → "123" をエコー  ← 毎回同じ文字列を表示！
  waitingForInput = true
  yield

ユーザーが Enter を入力
  keyBuffer = ['1', '2', '3', '\n']

フレーム4: A=?（再実行）
  getLineFromBuffer(['1', '2', '3', '\n'])
    → newlineIndex = 3
    → buffer.splice(0, 4) → ['1', '2', '3', '\n']
    → .slice(0, -1) → ['1', '2', '3']
    → .join('') → '123'
    → { complete: true, value: '123' }
    → keyBuffer = []  ← ここで消化
  parseInt('123') → 123
  A = 123  ✅ 正しい！
```

**問題**:
- ⚠️ 毎フレーム同じ文字列を表示（"1" → "12" → "123"）
- ⚠️ 画面が汚れる可能性

---

## 結論

### ケースB（キューを消化しない）が正しい

**理由**:
1. ✅ 複数桁入力が可能
2. ✅ Enterまで文字を蓄積
3. ✅ parseIntで正しい数値を取得

**エコーバックの頻度問題**:
- 確かに毎フレーム同じ文字列を表示する
- しかし、これは「問題」というより「仕様」

---

## エコーバックの挙動

### オプション1: 毎フレーム表示（シンプル）

```typescript
if (!result.complete) {
    this.waitingForInput = true;
    if (result.value !== '') {
        this.logFn(result.value);  // 毎フレーム "12", "123" ...
    }
    return 0;
}
```

**表示**:
```
フレーム1: "1"
フレーム2: "12"
フレーム3: "123"
```

**メリット**:
- ✅ シンプル
- ✅ ユーザーは入力内容を確認できる

**デメリット**:
- ⚠️ 同じ文字列が何度も表示される（ログが流れる）

---

### オプション2: 差分のみ表示（複雑）

```typescript
private lastEchoedInput: string = '';

if (!result.complete) {
    this.waitingForInput = true;
    
    // 前回と異なる場合のみエコーバック
    if (result.value !== this.lastEchoedInput && result.value !== '') {
        this.logFn(result.value);
        this.lastEchoedInput = result.value;
    }
    
    return 0;
}

// 入力完了時にリセット
this.waitingForInput = false;
this.lastEchoedInput = '';
```

**表示**:
```
フレーム1: "1"（新しい）
フレーム2: "12"（新しい）
フレーム3: "123"（新しい）
フレーム4-10: （何も表示しない、同じ "123"）
```

**メリット**:
- ✅ ログが汚れない
- ✅ 変更があった時だけ表示

**デメリット**:
- ⚠️ 状態管理が必要（lastEchoedInput）
- ⚠️ 複雑

---

### オプション3: エコーバックしない（最もシンプル）

```typescript
if (!result.complete) {
    this.waitingForInput = true;
    // エコーバックしない
    return 0;
}
```

**メリット**:
- ✅ 最もシンプル
- ✅ ログが汚れない

**デメリット**:
- ⚠️ ユーザーに視覚的フィードバックがない
- ⚠️ 入力中の内容が見えない

---

## 推奨: オプション2（差分のみ表示）

### 理由

1. **ユーザー体験**: 入力内容が見える（視覚的フィードバック）
2. **ログの清潔さ**: 変更時のみ表示
3. **実装の複雑さ**: 許容範囲（1フィールド追加のみ）

### 実装

```typescript
class WorkerInterpreter {
    private waitingForInput: boolean = false;
    private lastEchoedInput: string = '';  // ← 追加
    
    private evaluateInputNumberExpression(): number {
        if (!this.getLineFn) {
            throw new Error('行入力機能が設定されていません');
        }
        
        const result = this.getLineFn();
        
        if (!result.complete) {
            // 入力途中
            this.waitingForInput = true;
            
            // 前回と異なる場合のみエコーバック
            if (result.value !== this.lastEchoedInput && result.value !== '') {
                this.logFn(result.value);
                this.lastEchoedInput = result.value;
            }
            
            return 0;
        }
        
        // 入力完了
        this.waitingForInput = false;
        this.lastEchoedInput = '';  // リセット
        
        const value = parseInt(result.value, 10);
        if (isNaN(value)) return 0;
        return (value << 16) >> 16;
    }
}
```

---

## まとめ

### キューの消化タイミング

- ❌ エコーバック時に消化 → 文字が失われる
- ✅ Enter時に消化 → 正しく動作

### エコーバックの方式

- オプション1: 毎フレーム表示（シンプル、ログが汚れる）
- **オプション2: 差分のみ表示（推奨、バランスが良い）** ⭐⭐⭐⭐⭐
- オプション3: エコーバックしない（最もシンプル、フィードバックなし）

**推奨: オプション2（差分のみ表示）**

この理解で正しいでしょうか？
