: Simple pattern drawing example

?="パターン描画を開始します..." /

: 対角線を描画
I=0,10
  X=I Y=I
  `=1
  ?="ピクセル (" ?=X ?="," ?=Y ?=") を設定" /
@=I

?="対角線描画完了!" /