import {fromEvent, interval} from 'rxjs';
import {map, filter, scan, merge, reduce, mergeMap, concatMap} from 'rxjs/operators'; 


/* Things TO-DO 
1. Find a better way to do array of monsters
2. Add more constants to the constants list
3. Find a better way to represent ID of a monster. So far bullets are 1 2 3 4  and aliens are hardcoded 
4. Change array to array array
*/

function spaceinvaders() {
  type Event = "keydown" | "keyup"
  type Key = "a" | "d" | "w"
  type ViewType = "alienBullet" | "shipBullet" | "alien" | "ship"

  const constants = {
    AlienVelocity: 0.5, 
    AlienWidth: 30,
    AlienHeight: 10,
    AlienColumns: 4, 
    AlienRows: 4,
    BulletExpirationTime: 100, 
    BulletWidth: 3,
    BulletLength: 12, 
    BulletVelocity: 4,
    CanvasSize: 600,
    StartTime: 0,
    StartAlienCount: 16,
    ShipStartPos: {x: 253, y:500},
    ShipVelocity: 1
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

  interface gameObjectsI extends ObjectID {
    pos: LinearMotion,
    velocity: number
  }

  type gameObjects = Readonly<gameObjectsI>

  type State = Readonly<{
    time: number,
    ship: gameObjects,
    shipBullets: ReadonlyArray<gameObjects>,
    alienBullets: ReadonlyArray<gameObjects>,
    exit: ReadonlyArray<gameObjects>, 
    aliens: ReadonlyArray<gameObjects>,
    objCount: number, 
    gameOver: boolean, 
    level: number, //Later implementation for new levels
    score: number
  }>

  const createAliens = (vT: ViewType) => (rows: number) => (columns: number) => (velocity: number) => [...Array(constants.StartAlienCount).keys()].map(
    (val, index) => 
    ({
      id: String(Math.floor(val/rows)) + String(index % columns) + vT,
      createTime: 0,
      pos: new LinearMotion(100 + index % columns * 100, 50 + Math.floor(val/rows) * 50),
      velocity: velocity
    }))

  const initialState: State = {
    time: 0,
    ship: {id: "playerShip", pos: new LinearMotion(constants.ShipStartPos.x, constants.ShipStartPos.y), velocity: 0, createTime: 0}, //Initial Position
    shipBullets: [],
    alienBullets: [], 
    exit: [], 
    aliens: createAliens("alien")(constants.AlienColumns)(constants.AlienRows)(constants.AlienVelocity), 
    objCount: 0, 
    gameOver: false,
    level: 1,
    score: 0
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

  const reduceState = (s: State, e: Motion|Tick|Shoot) => 
    e instanceof Motion ? {
      ...s, 
      ship: {...s.ship, velocity: e.direction}
    } : 
    e instanceof Shoot? {
      ...s, 
      shipBullets: s.shipBullets.concat([{id: String(s.objCount), createTime: s.time, pos: s.ship.pos, velocity: constants.BulletVelocity}]),
      objCount: s.objCount + 1
    } : tick(s, e.elapsed)

  function collisionCheck([a, b] : [gameObjects, gameObjects]): boolean{
    return a.pos.x < b.pos.x 
    && a.pos.x + constants.AlienWidth > b.pos.x - constants.AlienWidth
    && a.pos.y < b.pos.y + constants.AlienHeight
    && a.pos.y + constants.BulletLength > b.pos.y
  }
    
  
  const tick = (s:State, elapsed: number) => {
    const expired = (g: gameObjects) => (elapsed - g.createTime) > constants.BulletExpirationTime,
    notExpired = (g: gameObjects) => (elapsed - g.createTime) <= constants.BulletExpirationTime,
    moveAliens = (g: gameObjects) => (elapsed) % 300 === 0 ? 
    {...g, pos: new LinearMotion(g.pos.x, g.pos.y + 10)} : (elapsed % 300 <= 150) ? 
                                                                   {...g, pos: new LinearMotion(g.pos.x + g.velocity, g.pos.y)} : 
                                                                   {...g, pos: new LinearMotion(g.pos.x - g.velocity, g.pos.y)},

    activeBullets:gameObjects[] = s.shipBullets.filter(notExpired),
    expiredBullets:gameObjects[] = s.shipBullets.filter(expired),
    allBulletsAndAliens = flatMap(s.shipBullets, b=> s.aliens.map<[gameObjects, gameObjects]>(r=>([b,r]))),
    collidedBulletsAndAliens = allBulletsAndAliens.filter(collisionCheck),
    collidedBullets = collidedBulletsAndAliens.map(([bullet,_])=>bullet),
    collidedAliens = collidedBulletsAndAliens.map(([_,aliens])=>aliens)
    
    return {
      ...s,
      time: elapsed,
      ship:{...s.ship, pos: wrapAround(s.ship.pos.add(new LinearMotion(s.ship.velocity, 0)))},
      shipBullets: activeBullets.filter(n => !collidedBullets.includes(n)).map(bulletMove), 
      exit: expiredBullets.concat(collidedBullets, collidedAliens),
      aliens: s.aliens.filter(n => !collidedAliens.includes(n)).map(moveAliens)
    }
  }

  function bulletMove(go: gameObjects): gameObjects{
    return {
      ...go, 
      pos: new LinearMotion(go.pos.x, go.pos.y - go.velocity)
    }
  }
  
  const subscription = interval(10).pipe(
    map(elapsed => new Tick(elapsed)),
    merge(startLeftMove, startRightMove, stopLeftMove, stopRightMove, shoot),
    scan(reduceState, initialState))
    .subscribe(updateView)

  function updateView(s: State){
    console.log(s.aliens)
    const ship = document.getElementById("ship")!
    const svg = document.getElementById("canvas")
    ship.setAttribute('transform', `translate(${s.ship.pos.x}, ${s.ship.pos.y}) matrix(0.15038946 0 0 0.15038946 12.499998 -0)`)
    
    const updateBulletView = (b: gameObjects) => {
       function createBulletView(){
        const v = document.createElementNS(svg.namespaceURI, "rect")!;
        //Can use Objects.Entries
        v.setAttribute("id", `${b.id}`)
        v.setAttribute("width", `${constants.BulletWidth}`)
        v.setAttribute("height", `${constants.BulletLength}`)
        v.setAttribute("fill", "white")
        v.classList.add("Bullets")
        svg.appendChild(v)
        return v
      }
      const v = document.getElementById(b.id) || createBulletView();
      v.setAttribute("x", `${b.pos.x + 50}`) //50 to offset from ship position, do not want to ruin other places values
      v.setAttribute("y", `${b.pos.y}`)
    };
    s.shipBullets.forEach(updateBulletView)

    const updateAlienView = (b: gameObjects) => {
    function createAlienView(){
      const v = document.createElementNS(svg.namespaceURI, "rect")!;
      //Can use Objects.Entries
      v.setAttribute("id", `${b.id}`)
      v.setAttribute("width", `${constants.AlienWidth}`)
      v.setAttribute("height", `${constants.AlienHeight}`)
      v.setAttribute("fill", "white")
      v.classList.add("Aliens")
      svg.appendChild(v)
      return v
    }
    const v = document.getElementById(b.id) || createAlienView() ;
    v.setAttribute("x", `${b.pos.x}`) 
    v.setAttribute("y", `${b.pos.y}`)
    };

    s.aliens.forEach(updateAlienView)

    s.exit.map(o=>document.getElementById(o.id))
          .filter((item) => item !== null || undefined) //isNotNullorUndefined
          .forEach(v=>{
            try {
              svg.removeChild(v)
            } catch(e) {
              // rarely it can happen that a bullet can be in exit 
              // for both expiring and colliding in the same tick,
              // which will cause this exception
              console.log("Already removed: "+v.id)
            }
          })
  }


  //Helper Functions
  function flatMap<T,U>(
    a:ReadonlyArray<T>,
    f:(a:T)=>ReadonlyArray<U>
  ): ReadonlyArray<U> {
    return Array.prototype.concat(...a.map(f));
  }

}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    spaceinvaders();
  }
  
  

