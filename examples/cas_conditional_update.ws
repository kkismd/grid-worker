: Compare-And-Swap (CAS) を使った条件付き更新の例
: 値が10以下の場合のみ2倍にする

: 初期値の設定
X=3 Y=3
`=5

: 条件付き更新（値が10以下なら2倍にする）
^DOUBLE_IF_SMALL
    X=3 Y=3
^RETRY
    O=`                   : 現在値を読む
    ?="Current value: " ?=O /
    
    ;=O>10 ?="Value too large, skipping" / #=!  : 10より大きければ何もしない
    
    N=O*2                 : 新値を計算（2倍）
    A=<&O,N>              : CAS実行
    ;=A=0 #=^RETRY        : 失敗なら再試行
    
    ?="Updated to: " ?=N /
    #=!

: メインプログラム
^START
    !=^DOUBLE_IF_SMALL    : 5 -> 10
    !=^DOUBLE_IF_SMALL    : 10 -> 20
    !=^DOUBLE_IF_SMALL    : 20 -> スキップ（10より大きい）
    #=-1
