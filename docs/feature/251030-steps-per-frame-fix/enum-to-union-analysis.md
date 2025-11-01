# InterpreterState: enum から union type への変更分析

## 概要

`docs/feature/251030-steps-per-frame-fix/revised-implementation-plan.md` で定義されている `InterpreterState` を enum から union type に変更する際の問題点を分析する。

## 現在の enum 定義（ドキュメント上）

```typescript
enum InterpreterState {
    Running = 'running',              // 通常実行中
    Halted = 'halted',                // プログラム停止（#=-1）
    WaitingForNextFrame = 'waiting'   // 次フレーム待機（#=`）
}
```

## 提案される union type 定義

```typescript
type InterpreterState = 'running' | 'halted' | 'waiting';
```

## 使用箇所の分析

### 1. 状態フィールドの宣言

**現在:**
```typescript
private state: InterpreterState = InterpreterState.Running;
```

**union type 変更後:**
```typescript
private state: InterpreterState = 'running';
```

**問題点:** なし。より簡潔になる。

---

### 2. 状態比較（内部実装）

**現在:**
```typescript
return this.state === InterpreterState.Running;
if (this.state === InterpreterState.WaitingForNextFrame) { ... }
if (this.state === InterpreterState.Halted) { ... }
```

**union type 変更後:**
```typescript
return this.state === 'running';
if (this.state === 'waiting') { ... }
if (this.state === 'halted') { ... }
```

**問題点:** 文字列リテラルの typo リスクが増加。ただし、TypeScript の型チェックにより、不正な文字列は検出される。

---

### 3. 公開 API での使用（WorkerManager.ts）

**現在 (346-347行目):**
```typescript
return this.workers.some(w => 
    w.interpreter.getState() === 'running' ||
    w.interpreter.getState() === 'waiting'
);
```

**問題点:** 既に文字列リテラルで比較している！enum を使用していない不整合がある。

---

### 4. テストコードでの使用

**現在 (620, 624, 628行目):**
```typescript
expect(interpreter.getState()).toBe('running');
expect(interpreter.getState()).toBe('waiting');
expect(interpreter.getState()).toBe('running');
```

**問題点:** テストも既に文字列リテラルを使用している。enum を使用していない。

---

## 問題点の総括

### 1. ドキュメント内の不整合

ドキュメント内で enum と文字列リテラルが混在している:

- **enum を使用している箇所:** 内部実装（WorkerInterpreter クラス内）
- **文字列リテラルを使用している箇所:** 
  - WorkerManager での状態チェック (346-347行目)
  - テストコード (620, 624, 628行目)

これは設計意図が不明確であることを示している。

### 2. union type への変更で生じる具体的な問題

#### 問題 A: 型安全性の低下（限定的）

**enum の利点:**
- `InterpreterState.Running` のように名前空間が明確
- 誤った文字列の使用を完全に防止
- IDE の補完が効きやすい

**union type の欠点:**
- 文字列リテラルを直接使用するため、typo のリスク
- ただし、TypeScript の型チェックで防げる

**評価:** 大きな問題ではない。TypeScript の型システムが十分にカバーする。

#### 問題 B: リファクタリングの困難さ

**enum の利点:**
- 状態名を変更する場合、enum の定義箇所のみ変更すれば良い
- IDE の "Find All References" や "Rename Symbol" が使える

**union type の欠点:**
- 文字列リテラルを全箇所で変更する必要がある
- 文字列検索に頼る必要がある（リスク増）

**評価:** 中程度の問題。ただし、このプロジェクトの規模では影響は限定的。

#### 問題 C: ドキュメントとコードの不整合

既にドキュメント内で enum と文字列リテラルが混在しているため、union type に統一することで逆に整合性が向上する可能性がある。

**評価:** union type への変更は、現在の不整合を解消する良い機会。

---

## 変更の影響範囲

### 変更が必要な箇所

1. **型定義**
   ```typescript
   // Before
   enum InterpreterState { ... }
   
   // After
   type InterpreterState = 'running' | 'halted' | 'waiting';
   ```

2. **状態フィールドの初期化**
   ```typescript
   // Before
   private state: InterpreterState = InterpreterState.Running;
   
   // After
   private state: InterpreterState = 'running';
   ```

3. **状態比較（約11箇所）**
   ```typescript
   // Before
   this.state === InterpreterState.Running
   
   // After
   this.state === 'running'
   ```

4. **状態代入（約4箇所）**
   ```typescript
   // Before
   this.state = InterpreterState.Halted;
   
   // After
   this.state = 'halted';
   ```

### 変更が不要な箇所

- **WorkerManager.ts (346-347行目):** 既に文字列リテラルを使用
- **テストコード (620, 624, 628行目):** 既に文字列リテラルを使用
- **公開API (`getState()`):** 戻り値の型は `InterpreterState` のまま

---

## メリットとデメリットの比較

### enum を使用する場合

**メリット:**
- 型安全性が高い（名前空間による保護）
- リファクタリングが容易
- 伝統的な OOP パターンに沿っている

**デメリット:**
- ドキュメント内の既存の文字列リテラル使用箇所と不整合
- やや冗長（`InterpreterState.Running` vs `'running'`）
- 現状のドキュメントが既に混在しており、追加の混乱を招く

### union type を使用する場合

**メリット:**
- シンプルで直感的
- 既存の文字列リテラル使用箇所（WorkerManager, テスト）と整合
- TypeScript の型システムで十分な型安全性を確保
- コードが簡潔になる

**デメリット:**
- 文字列リテラルの typo リスク（TypeScript でカバー可能）
- リファクタリング時に全箇所を変更する必要

---

## 推奨事項

### 結論: union type への変更を推奨

理由:
1. **整合性の向上:** ドキュメント内で既に文字列リテラルが使用されているため、union type に統一することで一貫性が高まる
2. **簡潔性:** コードがより読みやすく、シンプルになる
3. **実用性:** この規模のプロジェクトでは、enum の利点（リファクタリング容易性）よりも、簡潔性と整合性の方が重要
4. **TypeScript の型システムで十分:** union type でも十分な型安全性が確保される

### 変更実施時の注意点

1. **全箇所を一度に変更する:** 段階的な変更は混乱を招くため、一度にすべて変更する
2. **テストの実行:** 変更後、すべてのテストが通ることを確認する
3. **ドキュメントの更新:** `revised-implementation-plan.md` 内のすべての enum 使用箇所を union type に統一する
4. **型ガード関数の追加（オプション）:** さらなる型安全性のために、以下のようなヘルパー関数を追加することも検討:
   ```typescript
   function isValidState(state: string): state is InterpreterState {
       return state === 'running' || state === 'halted' || state === 'waiting';
   }
   ```

---

## 変更チェックリスト

実装時に確認すべき項目:

- [ ] `InterpreterState` 型定義を enum から union type に変更
- [ ] `private state` フィールドの初期化を `'running'` に変更
- [ ] 全ての `InterpreterState.Running` を `'running'` に変更
- [ ] 全ての `InterpreterState.Halted` を `'halted'` に変更
- [ ] 全ての `InterpreterState.WaitingForNextFrame` を `'waiting'` に変更
- [ ] `revised-implementation-plan.md` を更新
- [ ] テストコードが既存の文字列リテラル使用と整合することを確認
- [ ] すべてのテストが通ることを確認
- [ ] `npm run lint` でエラーがないことを確認

---

## 補足: 混在パターンの発生原因の推測

ドキュメント内で enum と文字列リテラルが混在している理由として考えられるのは:

1. **ドキュメント作成が段階的だった:** 初期は enum を想定していたが、後から文字列リテラルの方が実用的だと判断された
2. **異なる開発者/AI による執筆:** 異なる人/ツールが異なる部分を書いたため、スタイルが統一されなかった
3. **API 設計の変更:** 公開 API では文字列を返すことに決めたが、内部実装は enum のまま想定していた

いずれにせよ、この不整合は修正すべきであり、union type への統一が最も実用的な解決策である。
