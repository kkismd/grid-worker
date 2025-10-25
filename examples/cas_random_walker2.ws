: CASランダムウォーカー - ワーカー2（値200）
: 初期位置と方向が異なるバージョン

M=200  : ワーカーの値
X=3    : 初期X座標（右下付近）
Y=3    : 初期Y座標
D=0    : 初期方向（上向き）

`=M
?="Walker " ?=M ?=" started at (" ?=X ?="," ?=Y ?=")" /

^MAIN_LOOP
    H=X
    I=Y
    T=0
    
    ^TRY_DIRECTION
        ;=T>=4 #=^DEAD_END
        
        N=X
        P=Y
        
        ;=D=0 P=Y-1
        ;=D=1 N=X+1
        ;=D=2 P=Y+1
        ;=D=3 N=X-1
        
        B=0
        ;=N<0 B=1
        ;=N>=4 B=1
        ;=P<0 B=1
        ;=P>=4 B=1
        
        ;=B=1 #=^CHANGE_DIR
        ;=T>0 #=^CHECK_DEST
        #=^CHECK_DEST
    
    ^CHANGE_DIR
        D=D+1
        ;=D>=4 D=0
        T=T+1
        #=^TRY_DIRECTION
    
    ^CHECK_DEST
        X=N
        Y=P
        V=`
        
        ;=V=0 #=^DO_CAS
        
        X=H
        Y=I
        D=D+1
        ;=D>=4 D=0
        T=T+1
        #=^TRY_DIRECTION
    
    ^DO_CAS
        A=<&0,M>
        ;=A=1 #=^CAS_SUCCESS
        
        ?="COLLISION at (" ?=X ?="," ?=Y ?=")" /
        #=-1
    
    ^CAS_SUCCESS
        X=H
        Y=I
        `=0
        X=N
        Y=P
        ?="Moved to (" ?=X ?="," ?=Y ?=")" /
        #=^MAIN_LOOP

^DEAD_END
    ?="DEAD END at (" ?=X ?="," ?=Y ?=")" /
    #=-1
