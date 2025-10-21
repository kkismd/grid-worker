# JavaScript Generator入門

## 1. 基本のGenerator

### 1.1 通常の関数との違い

#### 通常の関数
```javascript
function normalFunction() {
    console.log('Start');
    console.log('Middle');
    console.log('End');
    return 'done';
}

normalFunction();
// 出力:
// Start
// Middle
// End
// 戻り値: 'done'
```

通常の関数は**一度に最後まで実行**されます。途中で止めることはできません。

#### Generator関数
```javascript
function* generatorFunction() {
    console.log('Start');
    yield 1;  // ← ここで一時停止
    
    console.log('Middle');
    yield 2;  // ← ここで一時停止
    
    console.log('End');
    return 'done';
}

const gen = generatorFunction();

gen.next();
// 出力: Start
// 戻り値: { value: 1, done: false }

gen.next();
// 出力: Middle
// 戻り値: { value: 2, done: false }

gen.next();
// 出力: End
// 戻り値: { value: 'done', done: true }
```

Generator関数は**yieldで一時停止**でき、`next()`を呼ぶたびに**再開**します。

### 1.2 Generator関数の定義

```javascript
// function* で定義（アスタリスクが重要）
function* myGenerator() {
    yield 'first';
    yield 'second';
    yield 'third';
}

// Generatorオブジェクトを作成
const gen = myGenerator();

// next()で順番に取得
console.log(gen.next());  // { value: 'first', done: false }
console.log(gen.next());  // { value: 'second', done: false }
console.log(gen.next());  // { value: 'third', done: false }
console.log(gen.next());  // { value: undefined, done: true }
```

### 1.3 yieldとreturnの違い

```javascript
function* demo() {
    yield 'A';  // 一時停止、次のnext()で再開
    yield 'B';  // 一時停止、次のnext()で再開
    return 'C'; // 終了、done: true になる
}

const gen = demo();

console.log(gen.next());  // { value: 'A', done: false }
console.log(gen.next());  // { value: 'B', done: false }
console.log(gen.next());  // { value: 'C', done: true }
console.log(gen.next());  // { value: undefined, done: true }
```

- **yield**: 一時停止、次の`next()`で**同じ関数内の続き**から再開
- **return**: 終了、`done: true`になる

### 1.4 for...ofループでの使用

```javascript
function* countToThree() {
    yield 1;
    yield 2;
    yield 3;
}

// for...ofはdone: trueまで自動的に繰り返す
for (const num of countToThree()) {
    console.log(num);
}
// 出力:
// 1
// 2
// 3
```

---

## 2. Generatorの状態管理

### 2.1 ローカル変数の保持

```javascript
function* counter() {
    let count = 0;  // ← この変数は保持される
    
    while (true) {
        count++;
        yield count;
    }
}

const gen = counter();

console.log(gen.next().value);  // 1
console.log(gen.next().value);  // 2
console.log(gen.next().value);  // 3
// countはyield間で保持される
```

**重要**: Generatorは一時停止する際、**ローカル変数の値を保持**します。

### 2.2 実行位置の保持

```javascript
function* steps() {
    console.log('Step 1');
    yield;
    
    console.log('Step 2');
    yield;
    
    console.log('Step 3');
    yield;
}

const gen = steps();

gen.next();  // Step 1 を実行、最初のyieldで停止
gen.next();  // Step 2 を実行、2番目のyieldで停止
gen.next();  // Step 3 を実行、3番目のyieldで停止
```

**重要**: Generatorは**どこで停止したか**を覚えています。

---

## 3. 再帰的Generator（yield*）

### 3.1 基本的なyield*

#### yield*なしの場合
```javascript
function* inner() {
    yield 'a';
    yield 'b';
}

function* outer() {
    yield 'start';
    yield inner();  // ← Generatorオブジェクトそのものをyield
    yield 'end';
}

for (const value of outer()) {
    console.log(value);
}
// 出力:
// start
// [object Generator]  ← Generatorオブジェクトが返される
// end
```

#### yield*を使った場合
```javascript
function* inner() {
    yield 'a';
    yield 'b';
}

function* outer() {
    yield 'start';
    yield* inner();  // ← innerのyieldを展開
    yield 'end';
}

for (const value of outer()) {
    console.log(value);
}
// 出力:
// start
// a  ← innerのyield
// b  ← innerのyield
// end
```

**yield***は、別のGeneratorの**すべてのyieldを展開**します。

### 3.2 yield*の動作詳細

```javascript
function* numbers() {
    yield 1;
    yield 2;
    yield 3;
}

function* letters() {
    yield 'A';
    yield 'B';
}

function* combined() {
    console.log('Before numbers');
    yield* numbers();  // numbersのすべてのyieldを実行
    console.log('After numbers, before letters');
    yield* letters();  // lettersのすべてのyieldを実行
    console.log('After letters');
}

const gen = combined();

gen.next();  // Before numbers → { value: 1, done: false }
gen.next();  // { value: 2, done: false }
gen.next();  // { value: 3, done: false }
gen.next();  // After numbers, before letters → { value: 'A', done: false }
gen.next();  // { value: 'B', done: false }
gen.next();  // After letters → { value: undefined, done: true }
```

### 3.3 yield*の戻り値

```javascript
function* inner() {
    yield 1;
    yield 2;
    return 'inner result';  // ← returnの値
}

function* outer() {
    console.log('Start');
    const result = yield* inner();  // ← returnの値を受け取る
    console.log('Result:', result);
    yield 'done';
}

const gen = outer();

gen.next();  // Start → { value: 1, done: false }
gen.next();  // { value: 2, done: false }
gen.next();  // Result: inner result → { value: 'done', done: false }
```

**yield***は、委譲先のGeneratorの**returnの値**を受け取ります。

---

## 4. 再帰的Generatorの実用例

### 4.1 ツリー構造の走査

```javascript
// ツリーノード
const tree = {
    value: 1,
    children: [
        {
            value: 2,
            children: [
                { value: 4, children: [] },
                { value: 5, children: [] }
            ]
        },
        {
            value: 3,
            children: [
                { value: 6, children: [] }
            ]
        }
    ]
};

// 再帰的に全ノードを走査
function* traverse(node) {
    yield node.value;  // 現在のノード
    
    for (const child of node.children) {
        yield* traverse(child);  // ← 再帰的に子ノードを走査
    }
}

for (const value of traverse(tree)) {
    console.log(value);
}
// 出力: 1, 2, 4, 5, 3, 6
```

### 4.2 ネストした配列のフラット化

```javascript
function* flatten(arr) {
    for (const item of arr) {
        if (Array.isArray(item)) {
            yield* flatten(item);  // ← 再帰的に展開
        } else {
            yield item;
        }
    }
}

const nested = [1, [2, [3, 4], 5], 6, [7, 8]];

console.log([...flatten(nested)]);
// 出力: [1, 2, 3, 4, 5, 6, 7, 8]
```

### 4.3 階層的なタスク実行

```javascript
function* task1() {
    console.log('Task 1: Step 1');
    yield;
    console.log('Task 1: Step 2');
    yield;
}

function* task2() {
    console.log('Task 2: Step 1');
    yield;
    console.log('Task 2: Step 2');
    yield;
}

function* mainTask() {
    console.log('Main: Start');
    yield;
    
    yield* task1();  // ← task1を完全に実行
    
    console.log('Main: Between tasks');
    yield;
    
    yield* task2();  // ← task2を完全に実行
    
    console.log('Main: End');
}

const gen = mainTask();

gen.next();  // Main: Start
gen.next();  // Task 1: Step 1
gen.next();  // Task 1: Step 2
gen.next();  // Main: Between tasks
gen.next();  // Task 2: Step 1
gen.next();  // Task 2: Step 2
gen.next();  // Main: End
```

---

## 5. WorkerScriptでの応用

### 5.1 現在の問題（loopStackベース）

```javascript
// 問題: 二重のループ構造
function* run() {
    while (currentLineIndex < length || loopStack.length > 0) {
        
        // ブロック内のステートメント実行（複雑）
        if (loopStack.length > 0) {
            const loop = loopStack[loopStack.length - 1];
            const stmt = loop.body[loop.bodyIndex];
            executeStatement(stmt);
            loop.bodyIndex++;
            yield;
            continue;
        }
        
        // 通常の行処理（別のロジック）
        const line = program.body[currentLineIndex];
        for (const stmt of line.statements) {
            executeStatement(stmt);
            yield;
        }
        currentLineIndex++;
    }
}
```

**問題**: 2つの異なる実行パスがある

### 5.2 再帰的Generatorによる解決

```javascript
// 解決: 統一的なステートメント実行
function* run() {
    for (const line of program.body) {
        yield* executeStatements(line.statements);
    }
}

function* executeStatements(statements) {
    for (const stmt of statements) {
        // 通常のステートメント実行
        executeStatement(stmt);
        yield;
    }
}

function* executeForBlock(stmt) {
    for (let i = start; i <= end; i++) {
        // ブロック本体を実行
        yield* executeStatements(stmt.body);  // ← 再帰的に委譲
    }
}
```

**メリット**: 
- ✅ 単一の実行パス（`executeStatements()`）
- ✅ FORブロックも通常のステートメントと同じ方法で処理
- ✅ `yield*`で自動的にネスト

### 5.3 入力待ちの透過的な処理

```javascript
function* executeStatements(statements) {
    for (const stmt of statements) {
        waitingForInput = false;
        executeStatement(stmt);
        
        // ━━━━ 入力待ちチェック（唯一の箇所）━━━━
        if (waitingForInput) {
            yield;  // 制御を返す
            continue;  // 再開時: 同じステートメントを再実行
        }
        
        yield;
    }
}

function* executeForBlock(stmt) {
    for (let i = start; i <= end; i++) {
        // executeStatements()が入力待ちを自動処理
        yield* executeStatements(stmt.body);
    }
}

// 使用例
function evaluateInputNumberExpression() {
    const result = getLineFn();
    
    if (!result.complete) {
        // 入力待ち
        waitingForInput = true;
        echoback(result.value);
        return 0;  // ダミー値
    }
    
    // 入力完了
    waitingForInput = false;
    return parseInt(result.value, 10);
}
```

**動作の流れ**:
```
run()
  → yield* executeStatements([stmt1, stmt2, ...])
     → executeStatement(stmt1)
        → executeForBlock(forStmt)
           → yield* executeStatements([innerStmt1, innerStmt2, ...])
              → executeStatement(innerStmt1)
                 → evaluateInputNumberExpression()
                    → waitingForInput = true
              ← executeStatements() が waitingForInput をチェック
              ← yield  ← ここで制御を返す
           ← yield* が透過的に伝播
        ← yield* が透過的に伝播
     ← yield* が透過的に伝播
  ← run() の呼び出し元に到達

【次のnext()呼び出し】
  → yield* が再開
     → yield* が再開
        → yield* が再開
           → executeStatements() の continue
              → 同じステートメント（innerStmt1）を再実行
                 → evaluateInputNumberExpression()
                    → 入力完了なら waitingForInput = false
```

---

## 6. よくある質問

### Q1: yieldとyield*の違いは？

```javascript
function* inner() {
    yield 1;
    yield 2;
}

function* outer1() {
    yield inner();  // Generatorオブジェクトそのものを返す
}

function* outer2() {
    yield* inner();  // innerのすべてのyieldを展開
}

console.log([...outer1()]);  // [[object Generator]]
console.log([...outer2()]);  // [1, 2]
```

- **yield**: 値を1つ返す
- **yield***: Generatorを展開して、すべてのyieldを実行

### Q2: yield*は何回でもネストできる？

**はい、無限にネストできます**:

```javascript
function* level3() {
    yield 'level 3';
}

function* level2() {
    yield 'level 2';
    yield* level3();
}

function* level1() {
    yield 'level 1';
    yield* level2();
}

function* level0() {
    yield 'level 0';
    yield* level1();
}

console.log([...level0()]);
// ['level 0', 'level 1', 'level 2', 'level 3']
```

### Q3: yield*でreturnの値を受け取れる？

**はい**:

```javascript
function* inner() {
    yield 1;
    yield 2;
    return 'inner done';
}

function* outer() {
    const result = yield* inner();
    console.log('Result:', result);  // Result: inner done
}

const gen = outer();
gen.next();  // { value: 1, done: false }
gen.next();  // { value: 2, done: false }
gen.next();  // Result: inner done → { value: undefined, done: true }
```

### Q4: Generatorは非同期処理？

**いいえ、同期処理です**:

```javascript
function* gen() {
    console.log('1');
    yield;
    console.log('2');
    yield;
    console.log('3');
}

const g = gen();
console.log('A');
g.next();  // 1
console.log('B');
g.next();  // 2
console.log('C');
g.next();  // 3

// 出力順序: A, 1, B, 2, C, 3
```

GeneratorはPromiseと組み合わせて非同期処理に使えますが、Generator自体は同期的に実行されます。

---

## 7. まとめ

### 基本のGenerator
- `function*`で定義
- `yield`で一時停止
- `next()`で再開
- ローカル変数と実行位置を保持

### yield*（Generator委譲）
- 別のGeneratorのすべてのyieldを展開
- 再帰的な構造に最適
- returnの値を受け取れる

### WorkerScriptでの利用
- ✅ 統一的なステートメント実行（`executeStatements()`）
- ✅ ブロック構造を再帰的に処理（`yield*`）
- ✅ 入力待ちが透過的に伝播（1箇所で処理）
- ✅ コードが短く、保守しやすい（70%削減）

再帰的Generatorは、複雑な階層構造を**エレガントに**処理する強力な手法です。
