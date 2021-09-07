import {fromEvent, interval} from 'rxjs';
import {map, filter, scan, merge, repeatWhen} from 'rxjs/operators'; 


/* Things TO-DO 
1. Alien Randomizer needs fixing
2. Question on drawing ontop while ignoring the rectangle 

Optimization: 
1. Generalize flatMapped function 
*/

function spaceinvaders() {
  type Event = "keydown" | "keyup"
  type Key = "a" | "d" | "w" | "r"
  type ViewType = "alienBullet" | "shipBullet" | "alien" | "ship" | "shields"

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
    ShipStartPos: {x: 253, y:500},
    ShipVelocity: 2,
    ShieldColumn: 3,
    ShieldRow: 3, 
    ShieldHeight: 5, 
    ShieldWidth: 150
  } as const 

  class Tick {constructor(public readonly elapsed: number) {}}
  class Motion {constructor(public readonly direction: number) {}}
  class Shoot{constructor(){}}
  class Restart{constructor(){}}

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

  type staticGroup =Readonly<{
    vT: ViewType,
    rows: number,
    columns: number,  
    velocity: number,  
    x_start: number,  
    y_start: number, 
    x_offset: number,  
    y_offset:number,
    staticHeight: number, 
    staticWidth: number
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
    shields: ReadonlyArray<gameObjects>,
    shipBullets: ReadonlyArray<gameObjects>,
    alienBullets: ReadonlyArray<gameObjects>,
    exit: ReadonlyArray<gameObjects>, 
    aliens: ReadonlyArray<gameObjects>,
    objCount: number, 
    gameOver: boolean, 
    level: number, //Later implementation for new levels
    alienMultiplier: number,
    score: number,
  }>

  const createStatic = (sP: staticGroup) =>
  [...Array(sP.rows * sP.columns).keys()].map(
    (val, index) => 
    ({
      id: String(Math.floor(val/sP.rows)) + String(index % sP.columns) + sP.vT,
      createTime: 0,
      pos: new LinearMotion(sP.x_start + index % sP.columns * sP.x_offset, sP.y_start + Math.floor(val/sP.rows) * sP.y_offset),
      velocity: sP.velocity,
      objHeight: sP.staticHeight,
      objWidth: sP.staticWidth
    }))

  const staticShield: staticGroup = {
    vT: "shields",
    rows: constants.ShieldRow,
    columns: constants.ShieldColumn,  
    velocity: 0,  
    x_start: 25,  
    y_start: 450, 
    x_offset: 200,  
    y_offset:10, 
    staticHeight: constants.ShieldHeight,
    staticWidth: constants.ShieldWidth
  }

  const staticAlien: staticGroup = {
    vT: "alien",
    rows: constants.AlienRows,
    columns: constants.AlienColumns,  
    velocity: constants.AlienVelocity,  
    x_start: 100,  
    y_start: 50, 
    x_offset: 100,  
    y_offset: 50, 
    staticHeight: constants.AlienHeight,
    staticWidth: constants.AlienWidth
  }
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
    shields: createStatic(staticShield),
    shipBullets: [],
    alienBullets: [], 
    exit: [], 
    aliens: createStatic(staticAlien), 
    objCount: 0, 
    gameOver: false,
    level: 0,
    alienMultiplier: 3,
    score: 0,
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
  const restartGame = observeKey('keydown', 'r', () => new Restart)

  function wrapAround({x, y}: LinearMotion): LinearMotion{
    const size = constants.CanvasSize 
    const wrapped = (position_x: number) => position_x + constants.ShipWidth > size ? position_x - size : position_x < 0 ? position_x + size : position_x 

    return new LinearMotion(wrapped(x), y)
  }

  const reduceState = (s: State, e: Motion|Tick|Shoot|Restart) => 
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
    e instanceof Restart ?{
      ...initialState,
      time: 0,
      exit: s.shipBullets.concat(s.shields, s.alienBullets, s.aliens)
    } :
    tick(s)

  function collisionCheck([a, b] : [gameObjects, gameObjects]): boolean{
    return a.pos.x < b.pos.x + b.objWidth
    && a.pos.x + a.objWidth > b.pos.x 
    && a.pos.y < b.pos.y + b.objHeight
    && a.pos.y + a.objHeight > b.pos.y
  }
  
  const handleCollisions = (s: State): State => {
    const 
    allBulletsAndAliens = flatMap(s.shipBullets, b=> s.aliens.map<[gameObjects, gameObjects]>(r=>([b,r]))),
    allBulletsAndShip = s.alienBullets.map(x => [x, s.ship]),
    allAlienBulletsAndShield = flatMap(s.alienBullets, shield => s.shields.map<[gameObjects, gameObjects]>(r => ([r, shield]))) 

    const colliderFilter = (arr: ReadonlyArray<gameObjects[]>, colliderLogic: (entry: [gameObjects,gameObjects]) => boolean) => {
      return <ReadonlyArray<gameObjects[]>>arr.filter(colliderLogic)
    },

    collidedBulletsAndShip = colliderFilter(allBulletsAndShip, collisionCheck),
    collidedBulletsAndAliens = colliderFilter(allBulletsAndAliens, collisionCheck),
    collidedAlienBulletsAndShield = colliderFilter(allAlienBulletsAndShield, collisionCheck),

    collidedBullets = collidedBulletsAndAliens.map(([bullet,_])=>bullet),
    collidedAlienBullets = collidedAlienBulletsAndShield.map(([_, bullet]) => bullet),
    collidedAlienShield = collidedAlienBulletsAndShield.map(([shield, _]) => shield),
    collidedAliens = collidedBulletsAndAliens.map(([_,aliens])=>aliens),

    activeAliens = s.aliens.filter(n => !collidedAliens.includes(n))

    return <State>{
      ...s, 
      shipBullets: s.shipBullets.filter(n => !collidedBullets.includes(n)).map(b => bulletMove(b)(-1)), 
      alienBullets: s.alienBullets.filter(n => !collidedAlienBullets.includes(n)).map(b => bulletMove(b)(1)),
      shields: s.shields.filter(n => !collidedAlienShield.includes(n)),
      aliens: activeAliens,
      exit: s.exit.concat(collidedBullets, collidedAliens, collidedAlienBullets, collidedAlienShield),
      score: s.score + collidedAliens.length,
      gameOver: collidedBulletsAndShip.length > 0 ? true: false 
    }
  }
  
  const tick = (s:State) => {
    const 
    expired = (g: gameObjects) => (s.time - g.createTime) > constants.BulletExpirationTime,
    notExpired = (g: gameObjects) => (s.time - g.createTime) <= constants.BulletExpirationTime,
    moveAliens = (g: gameObjects) => (s.time) % 300 === 0 ? 
                                     {...g, pos: new LinearMotion(g.pos.x, g.pos.y + 10)} : ((s.time) % 300 <= 150) ? 
                                     {...g, pos: new LinearMotion(g.pos.x + g.velocity, g.pos.y)} : 
                                     {...g, pos: new LinearMotion(g.pos.x - g.velocity, g.pos.y)},                                 

    activeShipBullets:gameObjects[] = s.shipBullets.filter(notExpired),
    activeAlienBullets:gameObjects[] = s.alienBullets.filter(notExpired),
    expiredAlienBullets:gameObjects[] = s.alienBullets.filter(expired),
    expiredShipBullets:gameObjects[] = s.shipBullets.filter(expired),

    alienBullets: gameObjects[] = s.aliens.length > 0 ? s.time % 100 === 0 ? [...Array(s.level + s.alienMultiplier)].map(
      (_, i) => ({
        id: i + "alienBullets",
        createTime: s.time,
        pos: randomAlienSelector(s.aliens, i).pos.add(new LinearMotion(constants.AlienWidth/2, constants.AlienHeight)), //offset for alien bullet
        velocity: constants.BulletVelocity, 
        objHeight: constants.BulletLength,
        objWidth: constants.BulletWidth
      }) 
    ): [] : []

    
    return handleCollisions({
      ...s,
      time: s.time + 1,
      ship:{...s.ship, pos: wrapAround(s.ship.pos.add(new LinearMotion(s.ship.velocity, 0)))},
      shipBullets: activeShipBullets, 
      alienBullets: activeAlienBullets.concat(alienBullets),
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
    merge(startLeftMove, startRightMove, stopLeftMove, stopRightMove, shoot, restartGame),
    scan(reduceState, initialState))
    .subscribe(updateView)

  function updateView(s: State){
    const ship = document.getElementById("ship")!
    const svg = document.getElementById("canvas")
    ship.setAttribute('transform', `translate(${s.ship.pos.x}, ${s.ship.pos.y}) matrix(0.15038946 0 0 0.15038946 12.499998 -0)`)
    const scores = document.getElementById("Scores")!; 
    scores.textContent = `Score: ${s.score}`
    const levels = document.getElementById("Level")!; 
    levels.textContent = `Level: ${s.level + 1}`

    if(s.gameOver){subscription.unsubscribe()}
    

    const updateRectView = (b: gameObjects, classType: string) => {
    function createRectView(){
      const v = document.createElementNS(svg.namespaceURI, "rect")!;
      //Can use Objects.Entries
      v.setAttribute("id", `${b.id}`)
      v.setAttribute("width", `${b.objWidth}`)
      v.setAttribute("height", `${b.objHeight}`)
      v.setAttribute("fill", "white")
      v.classList.add(classType)
      svg.appendChild(v)
      return v
    }
    const v = document.getElementById(b.id) || createRectView() ;
    v.setAttribute("x", `${b.pos.x}`) 
    v.setAttribute("y", `${b.pos.y}`)
    };

    s.shipBullets.forEach(x => updateRectView(x, "ShipBullets"))
    s.aliens.forEach(x => updateRectView(x, "Aliens"))
    s.shields.forEach(x => updateRectView(x, "Shields"))
    s.alienBullets.forEach(x => updateRectView(x, "AlienBullets"))

    s.exit.map(o=>document.getElementById(o.id))
          .filter((item) => item !== null || undefined) //isNotNullorUndefined
          .forEach(v=>{try {svg.removeChild(v)} catch(e) {console.log("Already removed: "+v.id)}})
  }


  //Helper Functions
  function flatMap<T,U>(
    a:ReadonlyArray<T>,
    f:(a:T)=>ReadonlyArray<U>
  ): ReadonlyArray<U> {
    return Array.prototype.concat(...a.map(f));
  }

  //Simple pseudo RAS, Random Alien Selector 
  class RNG {
    // LCG using GCC's constants
    m = 0x80000000// 2**31
    a = 1103515245
    c = 12345
    state:number
    constructor(seed: number) { //Added number to silence warning
      this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
    }
    nextInt() {
      this.state = (this.a * this.state + this.c) % this.m;
      return this.state;
    }
    nextFloat() {
      // returns in range [0,1]
      return this.nextInt() / (this.m - 1);
    }
  }

  //Lazy Sequence Number generator
  function randomAlienSelector(arr: Readonly<gameObjects[]>, seed: number): gameObjects{
    const rngObj = new RNG(seed) //constant
    const selector = arr[Math.floor(rngObj.nextFloat() * arr.length)] 
    return selector
  }

  

}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    spaceinvaders();
  }
  
  

