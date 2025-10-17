: Test new symbol mappings
: Backtick (`) for grid access, Tilde (~) for random
: Set position and store value
X=5 Y=3
`=100
: Read back and display 
A=`
?="Grid at (5,3): " ?=A /
: Test random number
B=~
?="Random: " ?=B /
: Test multiple random numbers
C=~ D=~ E=~
?="Three randoms: " ?=C ?=" " ?=D ?=" " ?=E /