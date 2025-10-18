: Key Echo - Simple Keyboard Input Demo
?="=== Key Echo Program ===" /
?="Press any key to see its code" /
?="Press ESC (27) to exit" /
/

^LOOP
    K=$
    ;=K>0 ?="Key code: " ?=K /
    ;=K=27 #=^END
    #=^LOOP

^END
    ?="Program ended. Goodbye!" /
    #=-1
