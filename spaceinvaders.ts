import {fromEvent, interval, zip} from 'rxjs';
import {map, filter, scan, merge} from 'rxjs/operators'; 

function spaceinvaders() {
  
  //Only two KeyboardEvents are ever used in this game  
  type Event = "keydown" | "keyup" 

  //These are the only four keys used as controls 
  type Key = "a" | "d" | "w" | "r" //These are the only four keys used as controls 

  //Objects in the game are split these kinds. This is used to facilitate ID creation for each game objects. 
  type ViewType = "alienBullet" | "shipBullet" | "alien" | "ship" | "shields" 

  //CONSTANTS USED THROUGHOUT THE PROGRAM, VARIABLE NAME ARE SELF-EXPLANATORY
  const constants = {
    AlienVelocity: 0.5, 
    AlienWidth: 30,
    AlienHeight: 10,
    AlienColumns: 3, 
    AlienRows: 3,
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
  //CONSTANTS USED THROUGHOUT THE PROGRAM, VARIABLE NAMES ARE SELF-EXPLANATORY

  /** 
  * Each of these classes correspond to a certain action type that the game can perform. 
  * Classes are used here due to the instanceof pattern matching inside reduceState. 
  * @Tick Acts as a game clock that keep tracks of time within the game. 
  * @Motion Determines which direction should the ship move. Also used to stop the ship. 
  * @Shoot Acts as a trigger that enables bullet emission. 
  * @AlienShoot Stores an array of randomly generated number from the RNG class below. 
  * @Restart Acts as a trigger to determine when the user has decided to restart the game.
  * Source: Taken from FRP Asteroids Course Notes, input action section. 
  */
  class Tick {constructor(public readonly elapsed: number) {}}
  class Motion {constructor(public readonly direction: number) {}}
  class Shoot{constructor(){}}
  class AlienShoot{constructor(public readonly shooters: number[]){}}
  class Restart{constructor(){}}

  /**
  * @LinearMotion Class similar to the Vec Class in FRP Asteroids Course Notes that models linear motion. 
  * Source: Taken from FRP Asteroids, Vector Maths section. 
  */
  class LinearMotion{
    constructor(public readonly x: number = 0, public readonly y: number = 0){}
    add = (b: LinearMotion) => new LinearMotion(this.x + b.x, this.y + b.y);
    sub = (b: LinearMotion) => this.add(b.scale(-1));
    scale = (s: number) => new LinearMotion(this.x * s, this.y * s);

    static Zero = new LinearMotion();
 }

  /**
  * @RNG A simple, seedable Random Number Generator. 
  * Source: Taken from PiApproximation Video on YouTube by Tim Dwyer. 
  */
  class RNG {
  // LCG using GCC's constants
  m = 0x80000000// 2**31
  a = 1103515245
  c = 12345
  constructor(readonly state: number){} 
  int (){
    return (this.a * this.state + this.c) % this.m; 
  }
  float() {
    return this.int() / (this.m - 1);
  }
  next(){
    return new RNG(this.int())
   }
 }

  /**
  * Objects in the games are generalized under @gameObjects type. 
  * An object type correspond to a @viewType above.  
  * A detailed description will be included as comments below. 
  */
  type ObjectID = Readonly<{
    //Each game object will have a unique ID and a creation time
    id: string,         
    createTime: number 
  }>
  interface gameObjectsI extends ObjectID {
    //Only gameObjects will have the properties below
    pos: LinearMotion,
    velocity: number,
    objHeight: number,
    objWidth: number
  }
  //A wrapper for the gameObjectsI interface, so gameObjects is a legitimate type and can be used for type annotations
  type gameObjects = Readonly<gameObjectsI>

  /**
  * The game is built using the Model-View-Controller architecture. 
  * Each game state is unique at each tick of the game clock which consists
  * of the properties below. 
  * Description of unusual properties below. 
  */
  type State = Readonly<{
    time: number, //Discrete timestep for each MVC cycle. 
    ship: gameObjects, 
    shields: ReadonlyArray<gameObjects>, 
    shipBullets: ReadonlyArray<gameObjects>, 
    alienBullets: ReadonlyArray<gameObjects>,
    exit: ReadonlyArray<gameObjects>, //Collection of game objects to be removed from the game visually
    aliens: ReadonlyArray<gameObjects>,
    objCount: number, //Total object counts in the game
    gameOver: boolean, 
    level: number, //Game difficulty indicator, a higher levels means more aliens and alien bullets go faster. 
    score: number //One alien killed means 1 score. 
  }>

  /**
  * The following type staticGroup is a type for initialstate positioning for static items during the start state. 
  * Description of unusual properties below. 
  */
  type staticGroup =Readonly<{
    vT: ViewType,
    rows: number,     //number of rows for a particular staticGroup
    columns: number,  //number of rows for a particular staticGroup
    velocity: number, 
    x_start: number,  //The starting x_position of the top-most left static item
    y_start: number,  //The starting y_position of the top-most left static item 
    x_offset: number, //The offset of x_position for each subsequent column of aliens, in other words, how far should each alien be apart from each other horizontally
    y_offset:number,  //The offset of y_position for each subsequent row of aliens, how far should each alien be apart from each other vertically
    staticHeight: number, //gameObject height property
    staticWidth: number //gameObject height property
  }>

  /**
  * @param sP:StaticGroup Takes in staticGroup type  
  * @param level:number A value that determines the rows and columns of the game, the larger this value the more aliens there are 
  * @returns An array of gameObjects with the initialized properties. 
  */
  const createStatic = (sP: staticGroup, level: number) =>
  [...Array((sP.rows + level) * (sP.columns + level)).keys()].map(
    (val, index) => 
    ({
      id: String(Math.floor(val/(sP.rows + level))) + String(index % (sP.columns + level)) + sP.vT,
      createTime: 0,
      pos: new LinearMotion(sP.x_start + index % (sP.columns + level) * sP.x_offset, sP.y_start + Math.floor(val/(sP.rows + level)) * sP.y_offset),
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
    shields: createStatic(staticShield, 0),
    shipBullets: [],
    alienBullets: [], 
    exit: [], 
    aliens: createStatic(staticAlien, 0), 
    objCount: 0, 
    gameOver: false,
    level: 0,
    score: 0
  }

  /**
   * 
   * @param e 
   * @param k 
   * @param result 
   * @returns 
   */
  const observeKey = <T>(e: Event, k: Key, result: () => T) => fromEvent<KeyboardEvent>(document, e).pipe(filter(({key}) => key === k),filter(({repeat}) => !repeat), map(result))
                     
  const startLeftMove = observeKey('keydown', 'a', () => new Motion(-constants.ShipVelocity)) //
  const startRightMove = observeKey('keydown', 'd', () => new Motion(constants.ShipVelocity)) //
  const stopLeftMove = observeKey('keyup', 'a', () => new Motion(0)) //
  const stopRightMove = observeKey('keyup', 'd', () => new Motion(0)) //
  const shoot = observeKey('keydown', 'w', ()=>new Shoot()) //
  const restartGame = observeKey('keydown', 'r', () => new Restart()) //

  const alienShootStream = (seed: number) => interval(1000).pipe(
    scan((r,_) => r.next(), new RNG(seed)),
    map(r => r.float())
  )
  const randomObservable = zip(alienShootStream(1), alienShootStream(2), alienShootStream(3), alienShootStream(4), alienShootStream(5)).pipe(
                           map(x => new AlienShoot(x)))

  function wrapAround({x, y}: LinearMotion): LinearMotion{
    const size = constants.CanvasSize 
    const wrapped = (position_x: number) => position_x + constants.ShipWidth > size ? position_x - size : position_x < 0 ? position_x + size : position_x 

    return new LinearMotion(wrapped(x), y)
  }

  const reduceState = (s: State, e: Motion|Tick|Shoot|Restart|AlienShoot) => 
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
      exit: s.shipBullets.concat(s.shields, s.alienBullets, s.aliens),
      restarted: true
    } : 
    e instanceof AlienShoot ? {
      ...s,
      alienBullets: s.aliens.length > 0 ? [...Array(5)].map(
        (_, i) => ({
          id: i + "alienBullets",
          createTime: s.time,
          pos: s.aliens[e.shooters.map(x => Math.floor(x * s.aliens.length))[i]].pos.add(new LinearMotion(constants.AlienWidth/2, constants.AlienHeight)), 
          velocity: constants.BulletVelocity * (s.level + 1), 
          objHeight: constants.BulletLength,
          objWidth: constants.BulletWidth
        }) 
      ): [] 
    }:
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
    expiredShipBullets:gameObjects[] = s.shipBullets.filter(expired)

    const stateToReturn = s.level < 3 ? s.gameOver ? <State>{...s, exit: s.aliens.concat(s.alienBullets, s.shields, s.shipBullets)} 
    : s.aliens.length === 0 ? <State>{
      time: 0,
      ship: {
              id: "playerShip", 
              pos: new LinearMotion(constants.ShipStartPos.x, constants.ShipStartPos.y), 
              velocity: 0, 
              createTime: 0,
              objHeight: constants.ShipHeight, 
              objWidth: constants.ShipWidth
            }, 
      shields: createStatic(staticShield, s.level + 1),
      shipBullets: [],
      alienBullets: [], 
      exit: s.alienBullets.concat(s.shipBullets), 
      aliens: createStatic(staticAlien, s.level + 1), 
      objCount: 0, 
      gameOver: false,
      level: s.level + 1,
      score: s.score,
      restarted: false
    } :
     handleCollisions(<State>{
      ...s,
      time: s.time + 1,
      ship:{...s.ship, pos: wrapAround(s.ship.pos.add(new LinearMotion(s.ship.velocity, 0)))},
      shipBullets: activeShipBullets, 
      alienBullets: activeAlienBullets,
      exit: expiredShipBullets.concat(expiredAlienBullets),
      aliens: s.aliens.map(moveAliens),
      restarted: false
    }) : {...s, exit: s.aliens.concat(s.alienBullets, s.shields, s.shipBullets), gameOver: true}

    return stateToReturn
  }

  const bulletMove = (go: gameObjects) => (direction: number) => {
    return{
      ...go, 
      pos: new LinearMotion(go.pos.x, go.pos.y + go.velocity*direction)
    }
  }
  
  const subscription = interval(10).pipe(
    map(elapsed => new Tick(elapsed)),
    merge(startLeftMove, startRightMove, stopLeftMove, stopRightMove, shoot, restartGame, randomObservable),
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

    if(s.gameOver){
      const v = document.getElementById("gameover")
      if (v === null){
        const v = document.createElementNS(svg.namespaceURI, "text")!;
        v.setAttribute('x', '50'),
        v.setAttribute('y', '300'),
        v.setAttribute('fill', 'white')
        v.setAttribute('font-size', '15')
        v.setAttribute('id', "gameover")
        v.textContent = "Game Over (Died or Reached Max Level 3!): Press R to restart the game :)";
        svg.appendChild(v);
      }
    }
    else{
      try {
        const v = document.getElementById("gameover")
        svg.removeChild(v)
      } catch (error) {
      }
    }
    

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

}
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = ()=>{
    spaceinvaders();
  }
  
  

