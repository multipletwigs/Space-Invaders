import {fromEvent, interval} from 'rxjs';
import {map, filter, scan, merge, reduce} from 'rxjs/operators'; 

function spaceinvaders() {
  type Event = "keydown" | "keyup"
  type Key = "a" | "d" | "w"

  const constants = {
    ShipStartPos: {x: 253, y:500},
    CanvasSize: 600,
    ShipVelocity: 1,
    StartTime: 0,
    BulletExpirationTime: 1000, 
    BulletRadius: 3, 
    BulletVelocity: 2
  } as const 

  class Tick {constructor(public readonly elapsed: number) {}}
  class Motion {constructor(public readonly direction: number) {}}
  class Shoot{constructor(){}}

  class LinearMotion{
  constructor(public readonly x: number = 0, public readonly y: number = 0){}
  add = (b: LinearMotion) => new LinearMotion(this.x + b.x, this.y + b.y);
  sub = (b: LinearMotion) => this.add(b.scale(-1));
  scale = (s: number) => new LinearMotion(this.x * s, this.y * s); 

  static Zero = new LinearMotion();
}

  type ObjectID = Readonly<{
    id: string, 
    createTime: number 
  }>

  interface Ship {
    pos: LinearMotion, 
    direction: number 
  }

  interface gameObjects extends ObjectID{
    pos: LinearMotion,
    velocity: number
  }

  type State = Readonly<{
    time: number,
    ship: Ship
    bullets: ReadonlyArray<gameObjects>,
    exit: ReadonlyArray<gameObjects>, 
    objCount: number, 
    gameOver: boolean  
  }>

  const initialState: State = {
    time: 0,
    ship: {pos: new LinearMotion(constants.ShipStartPos.x, constants.ShipStartPos.y), direction: 0}, //Initial Position
    bullets: [],
    exit: [], 
    objCount: 0, 
    gameOver: false
  }

  const observeKey = <T>(e: Event, k: Key, result: () => T) => 
                     fromEvent<KeyboardEvent>(document, e).pipe(
                       filter(({key}) => key === k),
                       filter(({repeat}) => !repeat), 
                       map(result)
                     )
                     
  const startLeftMove = observeKey('keydown', 'a', () => new Motion(-constants.ShipVelocity))
  const startRightMove = observeKey('keydown', 'd', () => new Motion(constants.ShipVelocity))
  const stopLeftMove = observeKey('keyup', 'a', () => new Motion(0))
  const stopRightMove = observeKey('keyup', 'd', () => new Motion(0))
  const shoot = observeKey('keydown', 'w', ()=>new Shoot())

  function wrapAround({x, y}: LinearMotion): LinearMotion{
    const size = constants.CanvasSize 
    const wrapped = (position_x: number) => position_x > size ? position_x - size : position_x < 0 ? position_x + size : position_x 

    return new LinearMotion(wrapped(x), y)
  }

  const reduceState = (s: State, e: Motion|Tick) => 
    e instanceof Motion ? {
      ...s, 
      ship: {...s.ship, direction: e.direction}
    } : {
      ...s, 
      ship: {...s.ship, pos: wrapAround(s.ship.pos.add(new LinearMotion(s.ship.direction, 0)))}
    }
  
  const subscription = interval(10).pipe(
    map(elapsed => new Tick(elapsed)),
    merge(
      startLeftMove, startRightMove, stopLeftMove, stopRightMove, shoot
    ),
    scan(reduceState, initialState))
    .subscribe(updateView)

  function updateView(s: State){
    const ship = document.getElementById("ship")!
    ship.setAttribute('transform', `translate(${s.ship.pos.x}, ${s.ship.pos.y}) matrix(0.15038946 0 0 0.15038946 12.499998 -0)`)
  }
  

}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    spaceinvaders();
  }
  
  

