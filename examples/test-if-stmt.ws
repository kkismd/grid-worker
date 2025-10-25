: FOR I = 0 TO 10
?="if statement test script start." /
@=I,0,10
  K=I*10
  ?="K=" ?=K
  : 数に応じた文字選択（排他的条件）
  ;=K<10 ?=" "
  ;=(K>=10)&(K<20) ?="."
  ;=(K>=20)&(K<40) ?="o"
  ;=(K>=40)&(K<60) ?="O"
  ;=(K>=60)&(K<80) ?="@"
  ;=K>=80 ?="#"
  /
#=@
/
?="if statement test script end." /
