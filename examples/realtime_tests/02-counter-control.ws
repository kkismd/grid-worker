: Counter Control - Keyboard Interactive Counter
?="=== Interactive Counter ===" /
?="Press + to increment" /
?="Press - to decrement" /
?="Press = to show current value" /
?="Press ESC to exit" /
/

C=0

^LOOP
    K=$
    
    : Increment
    ;=K=43 C=C+1 ?="Counter: " ?=C /
    
    : Decrement
    ;=K=45 C=C-1 ?="Counter: " ?=C /
    
    : Show value
    ;=K=61 ?="Current: " ?=C /
    
    : Exit
    ;=K=27 #=^END
    
    #=^LOOP

^END
    ?="Final count: " ?=C /
    ?="Thank you!" /
    #=-1
