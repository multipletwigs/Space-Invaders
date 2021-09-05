import {fromEvent, interval} from 'rxjs';
import {map, filter, scan, merge, reduce, mergeMap, concatMap} from 'rxjs/operators'; 


/* Things TO-DO 
1. Find a better way to represent ID of a monster. So far bullets are 1 2 3 4  and aliens are hardcoded 
2. Try and fix collision problem with rectangle and bullet
3. Generalize the collision handler
4. Adding Score 
5. Making aliens shoot at random by using the RNG class
6. Minimum requirements should be done
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
    ShipWidth: 77,
    ShipHeight: 70.15,
    CanvasSize: 600,
    StartTime: 0,
    StartAlienCount: 16,
    ShipStartPos: {x: 253, y:500},
    ShipVelocity: 1
  } as const 

  console.log(constants)

  class Tick {constructor(public readonly elapsed: number) {}}
  class Motion {constructor(public readonly direction: number) {}}
  class Shoot{constructor(){}}
  class alienShooter{constructor(){}}

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
    velocity: number,
    objHeight: number,
    objWidth: number
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
    alienMultiplier: number,
    score: number
  }>

  const createAliens = (vT: ViewType) => (rows: number) => (columns: number) => (velocity: number) => [...Array(constants.StartAlienCount).keys()].map(
    (val, index) => 
    ({
      id: String(Math.floor(val/rows)) + String(index % columns) + vT,
      createTime: 0,
      pos: new LinearMotion(100 + index % columns * 100, 50 + Math.floor(val/rows) * 50),
      velocity: velocity,
      objHeight: constants.AlienHeight,
      objWidth: constants.AlienWidth
    }))

  const initialState: State = {
    time: 0,
    ship: {
            id: "playerShip", 
            pos: new LinearMotion(constants.ShipStartPos.x, constants.ShipStartPos.y), 
            velocity: 0, 
            createTime: 0,
            objHeight: constants.ShipHeight, 
            objWidth: constants.ShipWidth
          }, 
    shipBullets: [],
    alienBullets: [], 
    exit: [], 
    aliens: createAliens("alien")(constants.AlienColumns)(constants.AlienRows)(constants.AlienVelocity), 
    objCount: 0, 
    gameOver: false,
    level: 0,
    alienMultiplier: 3,
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
  const alienShoot = interval(1000).pipe(map(_ => new alienShooter()))

  function wrapAround({x, y}: LinearMotion): LinearMotion{
    const size = constants.CanvasSize 
    const wrapped = (position_x: number) => position_x > size ? position_x - size : position_x < 0 ? position_x + size : position_x 

    return new LinearMotion(wrapped(x), y)
  }

  const reduceState = (s: State, e: Motion|Tick|Shoot|alienShooter) => 
    e instanceof Motion ? {
      ...s, 
      ship: {...s.ship, velocity: e.direction}
    } : 
    e instanceof Shoot? {
      ...s, 
      shipBullets: s.shipBullets.concat(
        [{
          id: String(s.objCount) + "shipBullets", 
          createTime: s.time, 
          pos: s.ship.pos.add(new LinearMotion(50, 0)), //offset
          velocity: constants.BulletVelocity,
          objHeight: constants.BulletLength,
          objWidth: constants.BulletWidth
        }]),
      objCount: s.objCount + 1
    } : 
    e instanceof alienShooter?{
      ...s,
      alienBullets: [...Array(s.level + s.alienMultiplier)].map(
        (x, i) => ({
          id: i + "alienBullets",
          createTime: s.time,
          pos: randomAlienSelector(s.aliens, i * i).pos.add(new LinearMotion(constants.AlienWidth/2, constants.AlienHeight)), //offset for alien bullet
          velocity: constants.BulletVelocity, 
          objHeight: constants.BulletLength,
          objWidth: constants.BulletWidth
        })
      )
    } : tick(s, e.elapsed)

  function collisionCheck([a, b] : [gameObjects, gameObjects]): boolean{
    return a.pos.x < b.pos.x + b.objWidth
    && a.pos.x + a.objWidth > b.pos.x 
    && a.pos.y < b.pos.y + b.objHeight
    && a.pos.y + a.objHeight > b.pos.y
  }
  
  const handleCollisions = (s: State): State => {
    const allBulletsAndAliens = flatMap(s.shipBullets, b=> s.aliens.map<[gameObjects, gameObjects]>(r=>([b,r]))),
    allBulletsAndShip = s.alienBullets.map(x => [x, s.ship]),
    collidedBulletsAndShip = allBulletsAndShip.filter(collisionCheck),
    collidedBulletsAndAliens = allBulletsAndAliens.filter(collisionCheck),
    collidedBullets = collidedBulletsAndAliens.map(([bullet,_])=>bullet),
    collidedAliens = collidedBulletsAndAliens.map(([_,aliens])=>aliens)
    console.log(allBulletsAndShip)

    return <State>{
      ...s, 
      shipBullets: s.shipBullets.filter(n => !collidedBullets.includes(n)).map(b => bulletMove(b)(-1)), 
      alienBullets: s.alienBullets.map(b => bulletMove(b)(1)),
      aliens: s.aliens.filter(n => !collidedAliens.includes(n)),
      exit: s.exit.concat(collidedBullets, collidedAliens),
      score: s.score + collidedAliens.length,
      gameOver: collidedBulletsAndShip.length > 0 ? true: false
    }
  }
  
  const tick = (s:State, elapsed: number) => {
    const expired = (g: gameObjects) => (elapsed - g.createTime) > constants.BulletExpirationTime,
    notExpired = (g: gameObjects) => (elapsed - g.createTime) <= constants.BulletExpirationTime,
    moveAliens = (g: gameObjects) => (elapsed) % 300 === 0 ? 
    {...g, pos: new LinearMotion(g.pos.x, g.pos.y + 10)} : (elapsed % 300 <= 150) ? 
                                                           {...g, pos: new LinearMotion(g.pos.x + g.velocity, g.pos.y)} : 
                                                           {...g, pos: new LinearMotion(g.pos.x - g.velocity, g.pos.y)},
    activeShipBullets:gameObjects[] = s.shipBullets.filter(notExpired),
    activeAlienBullets:gameObjects[] = s.alienBullets.filter(notExpired),
    expiredAlienBullets:gameObjects[] = s.alienBullets.filter(expired),
    expiredShipBullets:gameObjects[] = s.shipBullets.filter(expired)

    
    return handleCollisions({
      ...s,
      time: elapsed,
      ship:{...s.ship, pos: wrapAround(s.ship.pos.add(new LinearMotion(s.ship.velocity, 0)))},
      shipBullets: activeShipBullets, 
      alienBullets: activeAlienBullets,
      exit: expiredShipBullets.concat(expiredAlienBullets),
      aliens: s.aliens.map(moveAliens)
    })
  }

  const bulletMove = (go: gameObjects) => (direction: number) => {
    return{
      ...go, 
      pos: new LinearMotion(go.pos.x, go.pos.y + go.velocity*direction)
    }
  }
  
  const subscription = interval(10).pipe(
    map(elapsed => new Tick(elapsed)),
    merge(startLeftMove, startRightMove, stopLeftMove, stopRightMove, shoot, alienShoot),
    scan(reduceState, initialState))
    .subscribe(updateView)

  function updateView(s: State){
    console.log(s.alienBullets)
    const ship = document.getElementById("ship")!
    const svg = document.getElementById("canvas")
    ship.setAttribute('transform', `translate(${s.ship.pos.x}, ${s.ship.pos.y}) matrix(0.15038946 0 0 0.15038946 12.499998 -0)`)

    if(s.gameOver){subscription.unsubscribe()}
    
    const updateBulletView = (b: gameObjects) => {
       function createBulletView(){
        const v = document.createElementNS(svg.namespaceURI, "rect")!;
        //Can use Objects.Entries
        v.setAttribute("id", `${b.id}`)
        v.setAttribute("width", `${b.objWidth}`)
        v.setAttribute("height", `${b.objHeight}`)
        v.setAttribute("fill", "white")
        v.classList.add("Bullets")
        svg.appendChild(v)
        return v
      }
      const v = document.getElementById(b.id) || createBulletView();
      v.setAttribute("x", `${b.pos.x}`) //50 to offset from ship position, do not want to ruin other places values
      v.setAttribute("y", `${b.pos.y}`)
    };
    s.shipBullets.forEach(updateBulletView)
    s.alienBullets.forEach(updateBulletView)

    const updateAlienView = (b: gameObjects) => {
    function createAlienView(){
      const v = document.createElementNS(svg.namespaceURI, "rect")!;
      //Can use Objects.Entries
      v.setAttribute("id", `${b.id}`)
      v.setAttribute("width", `${b.objWidth}`)
      v.setAttribute("height", `${b.objHeight}`)
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

  //Simple pseudo RAS, Random Alien Selector 
  class RAS {
    readonly m = 0x80000000
    readonly a = 1103515245
    readonly c = 12345
    constructor(readonly state: number){}
    int(){
      return (this.a + this.state + this.c) % this.m;
    }
    float(){
      return this.int() / (this.m - 1); 
    }
  } 

  function randomAlienSelector(arr: Readonly<gameObjects[]>, seed: number): gameObjects{
    const rasObj = new RAS(arr.length + seed)
    const selector = arr[Math.floor(Math.random() * arr.length)] //Math.random() implementation is cringe
    return selector
  }

}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    spaceinvaders();
  }
  
  

