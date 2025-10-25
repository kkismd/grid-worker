: Compare-And-Swap (CAS) を使ったカウンタのインクリメント例
: グリッド座標[5,5]のカウンタを安全にインクリメントする

: カウンタの初期化
X=5 Y=5
`=0

: カウンタをインクリメント（CASのリトライループ）
^INCREMENT_COUNTER
    X=5 Y=5
^CAS_RETRY
    O=`                   : 現在値を読む
    N=O+1                 : 新値を計算
    A=<&O,N>              : CAS実行 - Grid[X,Y]がOならNをセット
    ;=A=0 #=^CAS_RETRY    : 失敗（A=0）なら再試行
    ?="Counter incremented to: " ?=N /
    #=!                   : 成功なら復帰

: メインプログラム
^START
    !=^INCREMENT_COUNTER  : カウンタをインクリメント
    !=^INCREMENT_COUNTER  : もう一度インクリメント
    !=^INCREMENT_COUNTER  : さらにインクリメント
    
    X=5 Y=5
    V=`
    ?="Final counter value: " ?=V /
    #=-1
