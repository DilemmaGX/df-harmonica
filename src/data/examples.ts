export interface ExampleProject {
  id: string
  title: string
  abc: string
}

export const EXAMPLES: ExampleProject[] = [
  {
    id: 'lonely-song',
    title: '寂寞的人伤心的歌',
    abc: [
      'X:1',
      'T:Random Tune',
      'M:4/4',
      'L:1/8',
      'Q:1/4=160',
      'K:C',
      'e2 e2 e e A2 z e e g e e A2',
      'd2 d2 d A c d e e d c e3',
    ].join('\n'),
  },
  {
    id: 'see-you-again',
    title: 'See You Again',
    abc: [
      'X:1',
      'T:Harmonica Tune',
      'M:4/4',
      'L:1/8',
      'Q:1/4=120',
      'K:C',
      'G, D C G,2 C1/2 D1/2 E1/2 D1/2 C1/2 D1/2 G, D C G,2 C1/2 D1/2 E1/2 D1/2 C1/2 D1/2',
      'G, D C G,2 C1/2 D1/2 E1/2 D1/2 C1/2 D1/2 G, D C G,2 C E G',
      'A3 G3 z3/2 C1/2 D D C E3 z E1/2 G1/2',
      'A B A G E D D C D D E C3 z1/2 C1/2 E1/2 G1/2',
      'A A G G3/2 A3/2 z3/2 C1/2 D D C E3 E G',
      'A c d e d c A c d d c c3 A c',
      'd d c c5',
    ].join('\n'),
  },
  {
    id: 'mermaid',
    title: '美人鱼 Mermaid',
    abc: [
      'X:1',
      'T:Harmonica Tune',
      'M:4/4',
      'L:1/8',
      'Q:1/4=120',
      'K:C',
      'z E A B c B c d e2 g2 d2 c B',
      'z E A B c B c d e2 b2 g2 e d',
      'c3/2 c1/2 c A d d e2 e3/2 b3/2 g e d e c',
      'd2 z A1/2 A1/2 e1/2 d c3/2 d A4',
    ].join('\n'),
  },
]