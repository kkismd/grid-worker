: WASD Movement - Simple Grid Movement Demo
?="=== WASD Movement Demo ===" /
?="Use W/A/S/D to move cursor" /
?="Press Q to quit" /
/

: Initial position
X=5
Y=5

^LOOP
    K=$
    
    : W = up (119)
    ;=K=119 Y=Y-1
    
    : S = down (115)
    ;=K=115 Y=Y+1
    
    : A = left (97)
    ;=K=97 X=X-1
    
    : D = right (100)
    ;=K=100 X=X+1
    
    : Boundary check
    ;=X<0 X=0
    ;=X>99 X=99
    ;=Y<0 Y=0
    ;=Y>99 Y=99
    
    : Update grid (draw cursor at position)
    `=255
    
    : Show position on key press
    ;=K>0 ?="Pos: X=" ?=X ?=" Y=" ?=Y /
    
    : Q = quit (113)
    ;=K=113 #=^END
    
    #=^LOOP

^END
    ?="Final position: X=" ?=X ?=" Y=" ?=Y /
    ?="Goodbye!" /
    #=-1
