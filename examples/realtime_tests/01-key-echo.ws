: Key Echo - Simple Keyboard Input Demo
?="=== Key Echo Program ===" /
?="Press any key to see its code" /
?="Press ESC (27) to exit" /
/

^LOOP
    A=$
    ;=A>0 ?="Key code: " ?=A /
    ;=A=27 #=^END
    #=^LOOP

^END
    ?="Program ended. Goodbye!" /
    #=-1
