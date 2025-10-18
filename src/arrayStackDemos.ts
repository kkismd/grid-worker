/**
 * 配列とスタック機能のデモスクリプト
 * 
 * このファイルは、WorkerScriptの配列とスタック機能が正しく動作することを
 * 実際のスクリプトで確認するためのものです。
 */

export const arrayStackDemos = {
    // デモ1: 基本的な配列操作
    basicArray: `
: 基本的な配列操作のデモ
[0]=100
[1]=200
[2]=300

?"Array values:" /
?="[0]=" ?=[0] /
?="[1]=" ?=[1] /
?="[2]=" ?=[2] /
`,

    // デモ2: 配列の初期化
    arrayInit: `
: 配列初期化のデモ
[1000]=10,20,30,40,50

?"Initialized array:" /
@=I,1000,1004
    ?=[I] /
#=@
`,

    // デモ3: 基本的なスタック操作
    basicStack: `
: スタック操作のデモ
[-1]=1
[-1]=2
[-1]=3

?"Stack pop (LIFO):" /
?=[-1] /
?=[-1] /
?=[-1] /
`,

    // デモ4: フィボナッチ数列
    fibonacci: `
: フィボナッチ数列（10個）
[0]=0
[1]=1

@=I,2,9
    [I]=[I-1]+[I-2]
#=@

?"Fibonacci sequence:" /
@=I,0,9
    ?=[I] /
#=@
`,

    // デモ5: 配列のソート
    bubbleSort: `
: バブルソート
[0]=64,34,25,12,22,11,90
N=7

?"Before sort:" /
@=I,0,N-1
    ?=[I] /
#=@

: ソート実行
@=I,0,N-2
    @=J,0,N-I-2
        ;=[J]>[J+1]
            [-1]=[J]
            [J]=[J+1]
            [J+1]=[-1]
    #=@
#=@

?"After sort:" /
@=I,0,N-1
    ?=[I] /
#=@
`,

    // デモ6: スタックを使った逆順
    reverseWithStack: `
: スタックを使った逆順出力
?"Push 1 to 5:" /
@=I,1,5
    ?=I /
    [-1]=I
#=@

?"Pop (reversed):" /
@=I,1,5
    ?=[-1] /
#=@
`,

    // デモ7: 配列の累積和
    cumulativeSum: `
: 配列の累積和
[100]=10,20,30,40,50

SUM=0
?"Values and cumulative sum:" /
@=I,100,104
    SUM=SUM+[I]
    ?=[I] ?"-> " ?=SUM /
#=@
`,

    // デモ8: ネストした配列アクセス
    indirectAccess: `
: 間接参照のデモ
[0]=100
[100]=42
[200]=99

?"Direct: [100]=" ?=[100] /
?"Indirect: [[0]]=" ?=[[0]] /

[1]=200
?"Indirect: [[1]]=" ?=[[1]] /
`,

    // デモ9: スタックを使った計算
    stackCalculation: `
: スタック計算: (5+3) * (10-2)

: 5 + 3
[-1]=5
[-1]=3
[-1]=[-1]+[-1]

: 10 - 2
[-1]=10
[-1]=2
B=[-1]
A=[-1]
[-1]=A-B

: 掛け算
RESULT=[-1]*[-1]
?"(5+3) * (10-2) = " ?=RESULT /
`,

    // デモ10: 階乗計算
    factorial: `
: 5!をスタックで計算

: 5,4,3,2,1をpush
@=I,5,1,-1
    [-1]=I
#=@

: pop して掛け算
RESULT=1
@=I,1,5
    RESULT=RESULT*[-1]
#=@

?"5! = " ?=RESULT /
`,

    // デモ11: 配列コピー
    arrayCopy: `
: 配列のコピー
[1000]=1,2,3,4,5

?"Original:" /
@=I,1000,1004
    ?=[I] /
#=@

: コピー実行
@=I,0,4
    [2000+I]=[1000+I]
#=@

?"Copied:" /
@=I,2000,2004
    ?=[I] /
#=@
`,

    // デモ12: 配列とスタックの組み合わせ
    combinedUsage: `
: 配列とスタックの組み合わせ

: 配列に値を設定
[100]=10,20,30

: 配列の値をスタックにpush
@=I,100,102
    [-1]=[I]
#=@

: スタックからpopして別の配列に
@=I,200,202
    [I]=[-1]
#=@

?"Result (reversed):" /
@=I,200,202
    ?=[I] /
#=@
`,
};

/**
 * すべてのデモを実行するヘルパー関数（テスト用）
 */
export function getAllDemos(): string[] {
    return Object.values(arrayStackDemos);
}

/**
 * 特定のデモを取得
 */
export function getDemo(name: keyof typeof arrayStackDemos): string {
    return arrayStackDemos[name];
}
