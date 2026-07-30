# sr5-walk-run-modes

For help and suggestions: [![Discord Server](https://img.shields.io/badge/-Discord-%232c2f33?style=flat-square&logo=discord)](https://discord.gg/NyCX2nN4qP)

House Rule customization for handling movement (walk/run/sprint) declarations.

SR5 rules are not too precise with movement mode rules.
- p. 161, Movement:
"Walk rate determines the farthest a character can move during a Combat Turn before they are considered to be Running."
- p. 162, Standard Movement (Walking and Running):
"As soon as the character exceeds their Walk rate, they are considered Running until the end of the Combat Turn and incur any penalties or benefits of running."
- p. 163 under Action Phase:
"Movement is declared and taken into consideration during the declare actions phase of the Action Phase. Once declared, a character cannot increase the distance they wish to move but can decrease the distance or bchange the direction if they run into unforeseen obstacles. The same movement penalties and bonuses apply regardless of whether the character moves their full distance."

It is kind of vague whether declaring movement, p.163, means only the route or also the mode. Naturally if the endpoint of the route is beyond max walking distance, then the mode is running right from the start.

Current SR5 system considers and flags character running only after they have moved beyond their walking rate. This means that with 2 phases they can first walk and then run, but not the other way. This also complies with p.162 "As soon as.." and p.161 "...before they are considered to be Running". However, if that limits players' option too much, this module offers options.

SETTINGS:

- Movement mode is declared in combat tracker either (A) once for the whole turn or (B) once every phase.
A is a strict interpretation of p.163 "Movement is declared and taken into consideration during the declare actions phase".
B offers more flexibility and allows a character to act without running penalty in 1st phase and move up to max walking distance and the run in 2nd phase.

- Clicked running mode can be set to create appropriate active effects automatically, but this requires an additonal module (sr5-ae-neg-filter).
 -- Penalty -2 to all active tests, other than the running test for sprinting distance increase.
 -- Bonus +2 (running) or +4 (sprinting) to physical defense tests.

- Selected mode limits the movement automatically to mode's max distance, but it can also be set for GM override. Used and max distances are shown in combat tracker and there is an option to set visibility of those numbers to all/players/owned only.

- Mode used will stay until the next possibility to change it, thus a character finishing the turn in running mode receives the running/sprinting defence bonus also in the beginning of next turn until they declare again.

- Clicking the sprint mode in combat tracker can be set to also open the running test dialog.


--
