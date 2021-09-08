import { fromEvent, interval, zip } from 'rxjs';
import { map, filter, scan, merge } from 'rxjs/operators';

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
    AlienBulletVelocity: 4,
    BulletExpirationTime: 1000,
    BulletWidth: 3,
    BulletLength: 12,
    BulletVelocity: 4,
    ShipWidth: 77,
    ShipHeight: 70.15,
    CanvasSize: 600,
    StartTime: 0,
    ShipStartPos: { x: 253, y: 500 },
    ShipVelocity: 2,
    ShieldColumn: 3,
    ShieldRow: 3,
    ShieldHeight: 5,
    ShieldWidth: 150,
    MaxLevel: 3
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
  * * Source: Taken from FRP Asteroids Course Notes, input action section. 
  */
  class Tick { constructor(public readonly elapsed: number) { } }
  class Motion { constructor(public readonly direction: number) { } }
  class Shoot { constructor() { } }
  class AlienShoot { constructor(public readonly shooters: number[]) { } }
  class Restart { constructor() { } }

  /**
  * @LinearMotion Class similar to the Vec Class in FRP Asteroids Course Notes that models linear motion. 
  * Source: Taken from FRP Asteroids, Vector Maths section. 
  */
  class LinearMotion {
    constructor(public readonly x: number = 0, public readonly y: number = 0) { }
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
    constructor(readonly state: number) { }
    int() {
      return (this.a * this.state + this.c) % this.m;
    }
    float() {
      return this.int() / (this.m - 1);
    }
    next() {
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
    dir: number,
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
  type staticGroup = Readonly<{
    vT: ViewType,
    rows: number,     //number of rows for a particular staticGroup
    columns: number,  //number of rows for a particular staticGroup
    velocity: number,
    dir: number,
    x_start: number,  //The starting x_position of the top-most left static item
    y_start: number,  //The starting y_position of the top-most left static item 
    x_offset: number, //The offset of x_position for each subsequent column of aliens, in other words, how far should each alien be apart from each other horizontally
    y_offset: number,  //The offset of y_position for each subsequent row of aliens, how far should each alien be apart from each other vertically
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
        id: String(Math.floor(val / (sP.rows + level))) + String(index % (sP.columns + level)) + sP.vT,
        createTime: 0,
        pos: new LinearMotion(sP.x_start + index % (sP.columns + level) * (sP.x_offset - (40 * level)), sP.y_start + Math.floor(val / (sP.rows + level)) * (sP.y_offset - (10 * level))),
        velocity: sP.velocity,
        dir: sP.dir,
        objHeight: sP.staticHeight,
        objWidth: sP.staticWidth
      }))

  //Static Shield initializations
  const staticShield: staticGroup = {
    vT: "shields",
    rows: constants.ShieldRow,
    columns: constants.ShieldColumn,
    velocity: 0,
    dir: 0,
    x_start: 25,
    y_start: 450,
    x_offset: 200,
    y_offset: 10,
    staticHeight: constants.ShieldHeight,
    staticWidth: constants.ShieldWidth
  }
  //Static Alien initializations
  const staticAlien: staticGroup = {
    vT: "alien",
    rows: constants.AlienRows,
    columns: constants.AlienColumns,
    velocity: constants.AlienVelocity,
    dir: 1,
    x_start: 100,
    y_start: 50,
    x_offset: 150,
    y_offset: 50,
    staticHeight: constants.AlienHeight,
    staticWidth: constants.AlienWidth
  }
  //Initial States of the model
  const initialState: State = {
    time: 0,
    ship: {
      id: "playerShip",
      pos: new LinearMotion(constants.ShipStartPos.x, constants.ShipStartPos.y),
      velocity: 0,
      createTime: 0,
      dir: 0,
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
   * * observeKey function (Pure function)
   * @param e Takes in an Event Type that determines the return object
   * @param k Takes in a specified Key Type
   * @param result The transformation process of the key event into an object of classes defined above
   * @returns An observable stream of objects of classes defined above
   * * Source: FRP Asteroids, handling more inputs section
   */
  const observeKey = <T>(e: Event, k: Key, result: () => T) => fromEvent<KeyboardEvent>(document, e).
    pipe(filter(({ key }) => key === k),
      filter(({ repeat }) => !repeat),
      map(result))

  const startLeftMove = observeKey('keydown', 'a', () => new Motion(-1))
  const startRightMove = observeKey('keydown', 'd', () => new Motion(1))
  const stopLeftMove = observeKey('keyup', 'a', () => new Motion(0))
  const stopRightMove = observeKey('keyup', 'd', () => new Motion(0))
  const shoot = observeKey('keydown', 'w', () => new Shoot())
  const restartGame = observeKey('keydown', 'r', () => new Restart())

  /**
   * * alienShootStream function (Pure function)
   * @param seed A random number for seeding. 
   * @returns A seedable observable stream of pseudorandom floats. 
   * * Source: piApproximation Video, randomnumberstream section by Tim Dywer
   */
  const alienShootStream = (seed: number) => interval(1000).pipe(
    scan((r, _) => r.next(), new RNG(seed)),
    map(r => r.float())
  )

  /**
   * There are a total of 5 different alienShootStreams here each with a fixed seed. 
   * The stream is "zipped" into an array of five pseudorandom floats in which each is mapped to be AlienShoot objects.
   * We will use the array of pseudorandom floats later to calculate which alien should shoot. 
   */
  const randomObservable = zip(alienShootStream(1), alienShootStream(2), alienShootStream(3), alienShootStream(4), alienShootStream(5)).pipe(
    map(x => new AlienShoot(x)))

  /**
   * * wrapAround function (Pure Function) 
   * * It is used to "teleport" the ship to the left/right side of the canvas if the ship ever reaches the other side. 
   * * The ship is smoothly wrapped from one side to another eventhough it keeps "flashing". This is due to how the function checks a position has
   * * reached one of the canvas edges. However, I have decided to kept it because the wrapping feels smoother compared to instantly teleporting around. 
   * @param param0 A parameter which is the destructuring of Linear Motion readonly class variables, consisting of x, y positions of an object.
   * @returns a new LinearMotion object that specifies the position of the ship.
   */
  function wrapAround({ x, y }: LinearMotion): LinearMotion {
    const size = constants.CanvasSize
    const wrapped = (position_x: number) => position_x + constants.ShipWidth > size ? position_x - size : position_x < 0 ? position_x + size : position_x
    return new LinearMotion(wrapped(x), y)
  }

  /**
   * * reduceState function (Pure function)
   * @param s Takes in a previous game state.
   * @param e Takes in a different action trigger that are objects of action classes above.
   * @returns Depending on what kind of action trigger, a different state is returned. Details of each
   *          different returns are as below.
   * If instanceof... 
   * @Motion returns a new state such that the velocity of the ship is adjusted to the direction of the ship where everything remains.
   * @Shoot returns a new state such that a new ShipBullet type gameObject is created, and appended to the array that stores AlienBullets.
   * @Restart returns a new state such any active gameObjects are removed by appending to exit, and initialState is restored through ...initialState.
   * @AlienShoot returns a new state such that a new array of AlienBullet typed gameObjects are created pseudorandomly based off the position of the alienArray.
   *             This will only happen if the number of aliens in the alien array are larger than 0. 
   * @else call the function tick which has a new State return annotation type. 
   */
  const reduceState = (s: State, e: Motion | Tick | Shoot | Restart | AlienShoot): State =>
    e instanceof Motion ? {
      ...s,
      ship: { ...s.ship, velocity: constants.ShipVelocity * e.direction }
    } :
      e instanceof Shoot ? {
        ...s,
        shipBullets: s.shipBullets.concat([{
          id: String(s.objCount) + "shipBullets",
          createTime: s.time,
          pos: s.ship.pos.add(new LinearMotion(50, 0)), //offset
          velocity: constants.BulletVelocity,
          dir: -1,
          objHeight: constants.BulletLength,
          objWidth: constants.BulletWidth
        }]),
        objCount: s.objCount + 1
      } :
        e instanceof Restart ? {
          ...initialState,
          time: 0,
          exit: s.shipBullets.concat(s.shields, s.alienBullets, s.aliens)
        } :
          e instanceof AlienShoot ? {
            ...s,
            alienBullets: s.aliens.length > 0 ? [...Array(5)].map( //define as constant for 5
              (_, i) => ({
                id: i + "alienBullets",
                createTime: s.time,
                pos: s.aliens[e.shooters.map(x => Math.floor(x * s.aliens.length))[i]].pos.add(new LinearMotion(constants.AlienWidth / 2, constants.AlienHeight)),
                dir: 1,
                velocity: constants.AlienBulletVelocity * (s.level + 1),
                objHeight: constants.BulletLength,
                objWidth: constants.BulletWidth
              })
            ) : []
          } :
            tick(s)

  /**
   * * collisionCheck function (Pure Function)
   * @param param0 Takes in an array of gameObjects consisting of two gameObjects in which it is destructured into [a,b]
   * @returns true if a and b are colliding, else false. 
   * * Source: https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection 
   */
  function collisionCheck([a, b]: [gameObjects, gameObjects]): boolean {
    return a.pos.x < b.pos.x + b.objWidth
      && a.pos.x + a.objWidth > b.pos.x
      && a.pos.y < b.pos.y + b.objHeight
      && a.pos.y + a.objHeight > b.pos.y
  }

  /**
   * * handleCollisions function (Pure Function)
   * @param s A game state for collision checking.
   * @returns A new state after dealing with all gameObjects that collided.
   */
  const handleCollisions = (s: State): State => {
    //In order to check for collisions properly, we will have to ensure each game object is matched to each other.
    //For example: If there are 10 aliens and 1 bullet from the ship, this 1 bullet will need to be paired with each alien for collision check. 
    //One exception is the mapping of all alienBullets to the ship. Since there's only one ship, map would be sufficient. 
    const
      allBulletsAndAliens = flatMap(s.shipBullets, b => s.aliens.map<[gameObjects, gameObjects]>(r => ([b, r]))),
      allAlienBulletsAndShield = flatMap(s.alienBullets, shield => s.shields.map<[gameObjects, gameObjects]>(r => ([r, shield]))),
      allBulletsAndShip = s.alienBullets.map(x => [x, s.ship])

    /**
     * * colliderFilter function (Pure Function)
     * @param arr Takes in a gameObject[] that is to be filtered with some collider logic. 
     * @param colliderLogic Takes in a function that returns a boolean upon checking for a collision logic. 
     * @return A gameObject[] that is filtered by the collider logic. 
     */
    const
      colliderFilter = (arr: ReadonlyArray<gameObjects[]>, colliderLogic: (entry: [gameObjects, gameObjects]) => boolean) => {
        return <ReadonlyArray<gameObjects[]>>arr.filter(colliderLogic)
      },

      //Filtering based on the collision checker
      collidedBulletsAndShip = colliderFilter(allBulletsAndShip, collisionCheck),
      collidedBulletsAndAliens = colliderFilter(allBulletsAndAliens, collisionCheck),
      collidedAlienBulletsAndShield = colliderFilter(allAlienBulletsAndShield, collisionCheck),

      //Only getting one of the two items from an array 
      collidedBullets = collidedBulletsAndAliens.map(([bullet, _]) => bullet),
      collidedAlienBullets = collidedAlienBulletsAndShield.map(([_, bullet]) => bullet),
      collidedAlienShield = collidedAlienBulletsAndShield.map(([shield, _]) => shield),
      collidedAliens = collidedBulletsAndAliens.map(([_, aliens]) => aliens),

      activeAliens = s.aliens.filter(n => !collidedAliens.includes(n))


    return <State>{
      ...s,
      shipBullets: s.shipBullets.filter(n => !collidedBullets.includes(n)).map(b => bulletMove(b)(-1)),
      alienBullets: s.alienBullets.filter(n => !collidedAlienBullets.includes(n)).map(b => bulletMove(b)(1)),
      shields: s.shields.filter(n => !collidedAlienShield.includes(n)),
      aliens: activeAliens,
      exit: s.exit.concat(collidedBullets, collidedAliens, collidedAlienBullets, collidedAlienShield),
      score: s.score + collidedAliens.length,
      gameOver: collidedBulletsAndShip.length > 0 ? true : false
    }
  }

  const tick = (s: State) => {
    const
      expired = (g: gameObjects) => (s.time - g.createTime) > constants.BulletExpirationTime,
      notExpired = (g: gameObjects) => (s.time - g.createTime) <= constants.BulletExpirationTime,
      passedLeftBorder = (g: gameObjects) => (g.pos.x < 80 ? true : false),   //Hard borders 
      passedRightBorder = (g: gameObjects) => (g.pos.x > 500 ? true : false), //Hard borders 

      animateAliens = (gArr: Readonly<gameObjects[]>) =>
        gArr.filter(passedLeftBorder).length > 0 ?
          gArr.map((g) => ({ ...g, dir: 1, pos: new LinearMotion(g.pos.x + 1, g.pos.y + 10) })) :
          gArr.filter(passedRightBorder).length > 0 ?
            gArr.map((g) => ({ ...g, dir: -1, pos: new LinearMotion(g.pos.x - 1, g.pos.y + 10) })) :
            gArr.map((g) => ({ ...g, pos: new LinearMotion(g.pos.x + (g.velocity) * g.dir, g.pos.y) })),

      activeShipBullets: gameObjects[] = s.shipBullets.filter(notExpired),
      activeAlienBullets: gameObjects[] = s.alienBullets.filter(notExpired),
      expiredAlienBullets: gameObjects[] = s.alienBullets.filter(expired),
      expiredShipBullets: gameObjects[] = s.shipBullets.filter(expired)

    const stateToReturn = s.level < constants.MaxLevel ?
      s.gameOver ? <State>{ ...s, exit: s.aliens.concat(s.alienBullets, s.shields, s.shipBullets) }
        : s.aliens.length === 0 ? <State>{
          time: 0,
          ship: {
            id: "playerShip",
            pos: new LinearMotion(constants.ShipStartPos.x, constants.ShipStartPos.y),
            velocity: 0,
            createTime: 0,
            dir: 0,
            objHeight: constants.ShipHeight,
            objWidth: constants.ShipWidth
          },
          shields: createStatic(staticShield, 0),
          shipBullets: [],
          alienBullets: [],
          exit: s.alienBullets.concat(s.shipBullets),
          aliens: createStatic(staticAlien, s.level + 1),
          objCount: 0,
          gameOver: false,
          level: s.level + 1,
          score: s.score
        } :
          handleCollisions(<State>{
            ...s,
            time: s.time + 1,
            ship: { ...s.ship, pos: wrapAround(s.ship.pos.add(new LinearMotion(s.ship.velocity, 0))) },
            shipBullets: activeShipBullets,
            alienBullets: activeAlienBullets,
            exit: expiredShipBullets.concat(expiredAlienBullets),
            aliens: animateAliens(s.aliens)
          }) : <State>{
            ...s,
            shields: [],
            shipBullets: [],
            alienBullets: [],
            exit: s.aliens.concat(s.alienBullets, s.shields, s.shipBullets),
            aliens: [],
            gameOver: true,
            level: s.level
          }

    return stateToReturn
  }

  const bulletMove = (go: gameObjects) => (direction: number) => {
    return {
      ...go,
      pos: new LinearMotion(go.pos.x, go.pos.y + go.velocity * direction)
    }
  }

  const subscription = interval(10).pipe(
    map(elapsed => new Tick(elapsed)),
    merge(startLeftMove, startRightMove, stopLeftMove, stopRightMove, shoot, restartGame, randomObservable),
    scan(reduceState, initialState))
    .subscribe(updateView)

  function updateView(s: State) {
    const ship = document.getElementById("ship")!
    const svg = document.getElementById("canvas")
    ship.setAttribute('transform', `translate(${s.ship.pos.x}, ${s.ship.pos.y}) matrix(0.15038946 0 0 0.15038946 12.499998 -0)`)
    const scores = document.getElementById("Scores")!;
    scores.textContent = `Score: ${s.score}`
    const levels = document.getElementById("Level")!;
    levels.textContent = `Level: ${s.level + 1}`

    if (s.gameOver) {
      const v = document.getElementById("gameover")
      if (v === null) {
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
    else {
      try {
        const v = document.getElementById("gameover")
        svg.removeChild(v)
      } catch (error) { }
    }


    const updateRectView = (b: gameObjects, classType: string) => {
      function createRectView() {
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
      const v = document.getElementById(b.id) || createRectView();
      v.setAttribute("x", `${b.pos.x}`)
      v.setAttribute("y", `${b.pos.y}`)
    };

    s.shipBullets.forEach(x => updateRectView(x, "ShipBullets"))
    s.aliens.forEach(x => updateRectView(x, "Aliens"))
    s.shields.forEach(x => updateRectView(x, "Shields"))
    s.alienBullets.forEach(x => updateRectView(x, "AlienBullets"))

    s.exit.map(o => document.getElementById(o.id))
      .filter((item) => item !== null || undefined) //isNotNullorUndefined
      .forEach(v => { try { svg.removeChild(v) } catch (e) { console.log("Already removed: " + v.id) } })
  }


  //Helper Functions
  function flatMap<T, U>(
    a: ReadonlyArray<T>,
    f: (a: T) => ReadonlyArray<U>
  ): ReadonlyArray<U> {
    return Array.prototype.concat(...a.map(f));
  }

}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
  window.onload = () => {
    spaceinvaders();
  }



