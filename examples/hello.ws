: Hello World example for WorkerScript CLI

?="Hello, WorkerScript CLI!" /
?="このスクリプトは基本的な出力テストです" /

: 変数の設定と表示
A=42
?="変数A = " ?=A /

: 座標設定とピクセル操作
?="グリッドにいくつかのピクセルを設定します..." /
X=10 Y=20
`=255
X=11 Y=21  
`=255
X=12 Y=22
`=255

?="ピクセル設定完了!" /