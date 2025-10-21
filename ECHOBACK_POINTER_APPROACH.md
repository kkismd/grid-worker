# エコーバック管理の正しい実装

**作成日**: 2025年10月21日  
**問題**: 文字列比較では連続した同じ文字に対応できない

---

## 問題の例

### 誤った実装（文字列比較）

```typescript
private lastEchoedInput: string = '';

if (result.value !== this.lastEchoedInput && result.value !== '') {
    this.logFn(result.value);
    this.lastEchoedInput = result.value;
}
```

**問題のケース**:
```
ユーザー入力: "1" "1" "1"

フレーム1: buffer = ['1']
  result.value = '1'
  lastEchoedInput = ''
  '1' !== '' → エコーバック "1"
  lastEchoedInput = '1'

フレーム2: buffer = ['1', '1']
  result.value = '11'
  lastEchoedInput = '1'
  '11' !== '1' → エコーバック "11"  ✅ OK
  lastEchoedInput = '11'

フレーム3: buffer = ['1', '1', '1']
  result.value = '111'
  lastEchoedInput = '11'
  '111' !== '11' → エコーバック "111"  ✅ OK
  lastEchoedInput = '111'
```

**実は問題ない？** → いいえ、別の問題があります。

---

## 本当の問題

### ケース: キー入力が高速に来た場合

```
フレーム1: buffer = []
  result.value = ''
  lastEchoedInput = ''
  '' === '' → エコーバックしない
  
（ユーザーが '1', '2', '3' を素早く入力）

フレーム2: buffer = ['1', '2', '3']  ← 1フレーム内に複数文字
  result.value = '123'
  lastEchoedInput = ''
  '123' !== '' → エコーバック "123"  ← 一度に全部表示
```

**問題**:
- '1' → '12' → '123' という段階的なエコーバックができない
- ユーザーが素早く入力すると、途中経過が見えない

---

## 正しい実装: ポインタ方式

### 概念

```typescript
private echoedLength: number = 0;  // エコーバック済みの文字数

// エコーバック
if (result.value.length > this.echoedLength) {
    // 未エコーの部分のみを表示
    const newChars = result.value.substring(this.echoedLength);
    this.logFn(newChars);
    this.echoedLength = result.value.length;
}
```

---

## 実装例

### 1. フィールド追加

```typescript
class WorkerInterpreter {
    private waitingForInput: boolean = false;
    private echoedLength: number = 0;  // ← ポインタ方式
    
    // ...
}
```

### 2. evaluateInputNumberExpression()

```typescript
private evaluateInputNumberExpression(): number {
    if (!this.getLineFn) {
        throw new Error('行入力機能が設定されていません');
    }
    
    const result = this.getLineFn();
    
    if (!result.complete) {
        // 入力途中
        this.waitingForInput = true;
        
        // エコーバック済みの位置より先の文字だけを表示
        if (result.value.length > this.echoedLength) {
            const newChars = result.value.substring(this.echoedLength);
            this.logFn(newChars);
            this.echoedLength = result.value.length;
        }
        
        return 0; // ダミー値
    }
    
    // 入力完了
    this.waitingForInput = false;
    this.echoedLength = 0;  // リセット
    
    const value = parseInt(result.value, 10);
    if (isNaN(value)) return 0;
    return (value << 16) >> 16;
}
```

---

## 動作例

### ケース1: 通常の入力

```
フレーム1: buffer = []
  result.value = ''
  echoedLength = 0
  ''.length (0) > 0 → false
  エコーバックなし

ユーザーが '1' を入力

フレーム2: buffer = ['1']
  result.value = '1'
  echoedLength = 0
  '1'.length (1) > 0 → true
  newChars = '1'.substring(0) = '1'
  logFn('1') → "1" を表示  ✅
  echoedLength = 1

ユーザーが '2' を入力

フレーム3: buffer = ['1', '2']
  result.value = '12'
  echoedLength = 1
  '12'.length (2) > 1 → true
  newChars = '12'.substring(1) = '2'
  logFn('2') → "2" を表示  ✅
  echoedLength = 2

ユーザーが '3' を入力

フレーム4: buffer = ['1', '2', '3']
  result.value = '123'
  echoedLength = 2
  '123'.length (3) > 2 → true
  newChars = '123'.substring(2) = '3'
  logFn('3') → "3" を表示  ✅
  echoedLength = 3

ユーザーが Enter を入力

フレーム5: buffer = ['1', '2', '3', '\n']
  result.complete = true
  parseInt('123') = 123
  echoedLength = 0  ← リセット
  return 123
```

**画面表示**:
```
1
2
3
```

---

### ケース2: 連続した同じ文字

```
ユーザーが '1' '1' '1' を入力

フレーム1: buffer = ['1']
  result.value = '1'
  echoedLength = 0
  newChars = '1'.substring(0) = '1'
  logFn('1') → "1"  ✅
  echoedLength = 1

フレーム2: buffer = ['1', '1']
  result.value = '11'
  echoedLength = 1
  newChars = '11'.substring(1) = '1'
  logFn('1') → "1"  ✅（2文字目の '1'）
  echoedLength = 2

フレーム3: buffer = ['1', '1', '1']
  result.value = '111'
  echoedLength = 2
  newChars = '111'.substring(2) = '1'
  logFn('1') → "1"  ✅（3文字目の '1'）
  echoedLength = 3
```

**画面表示**:
```
1
1
1
```

✅ 正しく動作！

---

### ケース3: 高速入力（1フレーム内に複数文字）

```
フレーム1: buffer = []
  result.value = ''
  echoedLength = 0
  エコーバックなし

（ユーザーが '1', '2', '3' を素早く入力）

フレーム2: buffer = ['1', '2', '3']
  result.value = '123'
  echoedLength = 0
  '123'.length (3) > 0 → true
  newChars = '123'.substring(0) = '123'
  logFn('123') → "123" を表示  ✅
  echoedLength = 3
```

**画面表示**:
```
123
```

✅ 一度に表示されるが、問題なし

---

## 利点

### ✅ 連続した同じ文字に対応

```
'111' の入力:
→ '1' → '1' → '1' と段階的にエコーバック
```

### ✅ 高速入力に対応

```
1フレーム内に複数文字:
→ 未エコーの部分 ('123') を一度に表示
```

### ✅ シンプルな実装

```typescript
if (result.value.length > this.echoedLength) {
    const newChars = result.value.substring(this.echoedLength);
    this.logFn(newChars);
    this.echoedLength = result.value.length;
}
```

---

## まとめ

### 誤った実装（文字列比較）

```typescript
if (result.value !== this.lastEchoedInput) {
    this.logFn(result.value);  // ← 全体を再表示
    this.lastEchoedInput = result.value;
}
```

**問題**:
- 全体を毎回表示（'1' → '12' → '123'）
- ログが汚れる

---

### 正しい実装（ポインタ方式）

```typescript
if (result.value.length > this.echoedLength) {
    const newChars = result.value.substring(this.echoedLength);
    this.logFn(newChars);  // ← 差分のみ表示
    this.echoedLength = result.value.length;
}
```

**利点**:
- ✅ 差分のみ表示（'1' → '2' → '3'）
- ✅ 連続した同じ文字に対応
- ✅ 高速入力に対応
- ✅ ログが清潔

この実装で進めます！
