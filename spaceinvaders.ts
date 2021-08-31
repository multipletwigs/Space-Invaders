import {fromEvent, interval} from 'rxjs';
import {map, filter, scan, merge, reduce} from 'rxjs/operators'; 

function spaceinvaders() {
  type Event = "keydown" | "keyup"
  type Key = "a" | "d"
  const constants = {
    CanvasSize: 600
  }
  class Tick {constructor(public readonly elapsed: number) {}}
  class Motion {constructor(public readonly direction: number) {}}

  class LinearMotion{
  constructor(public readonly x: number = 0, public readonly y: number = 0){}
  add = (b: LinearMotion) => new LinearMotion(this.x + b.x, this.y + b.y);
  sub = (b: LinearMotion) => this.add(b.scale(-1));
  scale = (s: number) => new LinearMotion(this.x * s, this.y * s); 

  static Zero = new LinearMotion();
}

  type State = Readonly<{
    pos: LinearMotion
    direction: number
  }>

  const initialState: State = {
    pos: new LinearMotion(300, 500), //Initial Position
    direction: 0
  }

  const observeKey = <T>(e: Event, k: Key, result: () => T) => 
                     fromEvent<KeyboardEvent>(document, e).pipe(
                       filter(({key}) => key === k),
                       filter(({repeat}) => !repeat), 
                       map(result)
                     )
  const startLeftMove = observeKey('keydown', 'a', () => new Motion(-1))
  const startRightMove = observeKey('keydown', 'd', () => new Motion(1))
  const stopLeftMove = observeKey('keyup', 'a', () => new Motion(0))
  const stopRightMove = observeKey('keyup', 'd', () => new Motion(0))

  function wrapAround({x, y}: LinearMotion): LinearMotion{
    const size = constants.CanvasSize 
    const wrapped = (position_x: number) => position_x > size ? position_x - size : position_x < 0 ? position_x + size : position_x 

    return new LinearMotion(wrapped(x), y)
  }

  const reduceState = (s: State, e: Motion|Tick) => 
    e instanceof Motion ? {
      ...s, 
      direction: e.direction
    } : {
      ...s, 
      pos: wrapAround(s.pos.add(new LinearMotion(s.direction, 0)))
    }
  
  const subscription = interval(10).pipe(
    map(elapsed => new Tick(elapsed)),
    merge(
      startLeftMove, startRightMove, stopLeftMove, stopRightMove
    ),
    scan(reduceState, initialState))
    .subscribe(updateView)

  function updateView(s: State){
    const ship = document.getElementById("ship")!
    ship.setAttribute('transform', `translate(${s.pos.x}, ${s.pos.y}) matrix(0.15038946 0 0 0.15038946 12.499998 -0)`)
  }
  

}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    spaceinvaders();
  }
  
  

