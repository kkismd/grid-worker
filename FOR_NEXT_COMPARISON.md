# BASIC言語のFOR..NEXT構文比較

## 歴史的なBASIC方言の構文

### 1. **Dartmouth BASIC (1964) - オリジナル**
```basic
FOR I = 1 TO 100
  PRINT I
NEXT I
```

### 2. **Microsoft BASIC (1975~)**
```basic
FOR I = 1 TO 100 STEP 2
  PRINT I
NEXT I
' または
NEXT  ' 変数名省略可
```

### 3. **Commodore BASIC (PET/C64)**
```basic
FOR I = 1 TO 100
  PRINT I
NEXT I
```

### 4. **Apple II BASIC**
```basic
FOR I = 1 TO 100
  PRINT I
NEXT I
```

### 5. **TinyBASIC (1976)**
```basic
FOR I = 1 TO 100
  PRINT I
NEXT I
```

### 6. **QuickBASIC/QBasic**
```basic
FOR I% = 1 TO 100 STEP 2
  PRINT I%
NEXT I%
```

### 7. **Visual Basic**
```vb
For I As Integer = 1 To 100 Step 2
    Console.WriteLine(I)
Next I
' または
Next  ' 変数名省略可
```

## 共通パターンの分析

### 🔄 **統一された特徴**
- **FOR**: 必ず変数への代入形式 `FOR 変数 = 開始値 TO 終了値`
- **NEXT**: 必ず同じ変数名を指定 `NEXT 変数`（一部で省略可）
- **対称性**: FOR文とNEXT文で同じ変数を使用

### 📝 **構文要素**
1. **ループ変数**: 必ず明示的な変数名
2. **範囲指定**: `TO` キーワードで範囲を表現
3. **ステップ**: オプションで `STEP` 値を指定
4. **終了**: `NEXT` + 同じ変数名

## WorkerScriptとの比較

### 現在のWorkerScript
```
FOR: I=1,100     (カンマ区切り)
NEXT: @=I        (@ 記号 + 変数)
```

### 標準BASIC
```
FOR: I=1 TO 100  (TO キーワード)
NEXT: NEXT I     (NEXT キーワード + 変数)
```

## 🎯 不整合の本質

**問題点**:
1. **FOR文**: 変数中心（`I=1,100`）
2. **NEXT文**: 記号中心（`@=I`）
3. **非対称性**: FOR文の変数がNEXT文で異なる位置

**BASIC標準との乖離**:
- BASIC: 両方とも変数が主語
- WorkerScript: FORは変数主語、NEXTは記号主語

## 改善案の評価

### 案1: BASIC標準準拠
```
FOR I=1,100
@I または NEXT I
```

### 案2: WorkerScript記号統一（従来案）
```
@=1,100,I  (記号主語で統一)
@=I       (現状維持)
```

### 案3: 変数中心統一
```
I=1,100   (現状維持)
I@        (変数主語で統一)
```

### 🎯 案4: GOSUB/RETURNパターン適用（推奨）
```
@=I,1,100     ← ループ開始 (@ 記号統一)
  ...処理...
#=@           ← ループ終了 (# 記号で対称終了)
```

**GOSUB/RETURNとの対応関係**:
```
!=^SUB  ↔  @=I,1,100    (呼び出し/ループ開始)
#=!     ↔  #=@          (復帰/ループ終了)
```

**利点**:
1. **記号の一貫性**: `@` でループ、`#` で終了
2. **パターンの統一**: GOSUB/RETURNと同じ `記号=値` → `#=記号` 構造
3. **WorkerScript固有性**: BASIC模倣でなく独自言語として洗練
4. **直観的理解**: 「ループ開始」→「ループ終了」が記号で明確