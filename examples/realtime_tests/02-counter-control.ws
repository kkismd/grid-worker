: Counter Control - Keyboard Interactive Counter
?="=== Interactive Counter ===" /
?="Press + to increment" /
?="Press - to decrement" /
?="Press = to show current value" /
?="Press ESC to exit" /
/

C=0

^LOOP
    A=$
    
    : Increment
    ;=A=43 C=C+1 ?="Counter: " ?=C /
    
    : Decrement
    ;=A=45 C=C-1 ?="Counter: " ?=C /
    
    : Show value
    ;=A=61 ?="Current: " ?=C /
    
    : Exit
    ;=A=27 #=^END
    
    #=^LOOP

^END
    ?="Final count: " ?=C /
    ?="Thank you!" /
    #=-1

    #=-1
