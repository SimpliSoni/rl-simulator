"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Play, Pause, RotateCcw, SkipForward, Upload, Eye, Grid3x3, Bot, BarChart3 } from "lucide-react"
import { Line, Bar } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend)

const loadThreeJS = () => {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).THREE) {
      resolve((window as any).THREE)
      return
    }

    const script = document.createElement("script")
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
    script.onload = () => {
      // Load OrbitControls
      const controlsScript = document.createElement("script")
      controlsScript.src = "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"
      controlsScript.onload = () => resolve((window as any).THREE)
      controlsScript.onerror = reject
      document.head.appendChild(controlsScript)
    }
    script.onerror = reject
    document.head.appendChild(script)
  })
}

// --- Helper Components ---
const InfoCard = ({ title, value, description }) => (
  <div className="bg-gray-900 p-4 rounded-lg text-center">
    <h4 className="text-lg font-semibold text-gray-400">{title}</h4>
    <p className="text-3xl font-bold text-white my-2">{value}</p>
    <p className="text-xs text-gray-500">{description}</p>
  </div>
)

const ChartCard = ({ title, description, children }) => (
  <div className="bg-gray-900 p-4 rounded-lg flex flex-col">
    <h3 className="text-lg font-semibold mb-1">{title}</h3>
    <p className="text-xs text-gray-500 mb-3">{description}</p>
    <div className="flex-grow relative">{children}</div>
  </div>
)

// --- Enhanced Dashboard Component ---
const Dashboard = ({ rewardHistory, stepsPerEpisode, onClose }) => {
  const cumulativeReward = rewardHistory.reduce((acc, reward, index) => {
    acc.push((acc[index - 1] || 0) + reward)
    return acc
  }, [])

  const cumulativeRewardData = {
    labels: cumulativeReward.map((_, index) => `Step ${index + 1}`),
    datasets: [
      {
        label: "Cumulative Reward",
        data: cumulativeReward,
        borderColor: "rgb(75, 192, 192)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
        fill: true,
        tension: 0.1,
      },
    ],
  }

  const stepsChartData = {
    labels: stepsPerEpisode.map((_, index) => `Ep ${index + 1}`),
    datasets: [
      {
        label: "Episode Length (Steps)",
        data: stepsPerEpisode,
        backgroundColor: "rgba(255, 99, 132, 0.5)",
      },
    ],
  }

  const avgEpisodeLength =
    stepsPerEpisode.length > 0
      ? (stepsPerEpisode.reduce((a, b) => a + b, 0) / stepsPerEpisode.length).toFixed(1)
      : "N/A"

  return (
    <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-6xl h-full max-h-[90vh] text-white flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Agent Performance Dashboard</h2>
          <button onClick={onClose} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors">
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InfoCard
            title="Episodes Completed"
            value={stepsPerEpisode.length}
            description="The number of times the agent has reached the goal."
          />
          <InfoCard
            title="Avg. Episode Length"
            value={avgEpisodeLength}
            description="The average number of steps taken to reach the goal."
          />
          <InfoCard
            title="Total Reward"
            value={(cumulativeReward.slice(-1)[0] || 0).toFixed(2)}
            description="The sum of all rewards and penalties collected by the agent."
          />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto">
          <ChartCard
            title="Cumulative Reward Over Time"
            description="Shows the total accumulated reward. A steep upward trend indicates good performance."
          >
            <Line data={cumulativeRewardData} options={{ maintainAspectRatio: false }} />
          </ChartCard>
          <ChartCard
            title="Episode Lengths"
            description="Shows how many steps the agent took in each episode. Lower bars are better."
          >
            <Bar data={stepsChartData} options={{ maintainAspectRatio: false }} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}

// --- Main Simulator Component ---
const App = () => {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const animationRef = useRef({})
  const [threeLoaded, setThreeLoaded] = useState(false)

  const [isRunning, setIsRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [simulationSpeed, setSimulationSpeed] = useState(1)
  const [selectedEnvironment, setSelectedEnvironment] = useState("gridworld")
  const [policy, setPolicy] = useState(null)
  const [metrics, setMetrics] = useState({ totalReward: 0, steps: 0 })
  const [showQValues, setShowQValues] = useState(true)
  const [showTrajectories, setShowTrajectories] = useState(true)
  const [showDashboard, setShowDashboard] = useState(false)
  const [rewardHistory, setRewardHistory] = useState([])
  const [stepsPerEpisode, setStepsPerEpisode] = useState([])
  const [currentEpisode, setCurrentEpisode] = useState(1)
  const [trajectory, setTrajectory] = useState([])

  const environments = {
    gridworld: {
      name: "Grid World",
      size: { x: 4, y: 4 },
      obstacles: [
        [1, 1],
        [2, 2],
      ],
      goals: [[3, 3]],
      start: [0, 0],
    },
    maze: {
      name: "Maze Environment",
      size: { x: 6, y: 6 },
      obstacles: [
        [1, 0],
        [1, 1],
        [1, 2],
        [3, 3],
        [3, 4],
        [4, 4],
      ],
      goals: [[5, 5]],
      start: [0, 0],
    },
    multiagent: {
      name: "Multi-Agent Arena",
      size: { x: 8, y: 8 },
      obstacles: [
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      goals: [
        [0, 7],
        [7, 0],
      ],
      start: [
        [0, 0],
        [7, 7],
      ],
    },
  }

  const initializeScene = useCallback(() => {
    if (!mountRef.current || !threeLoaded) return

    const THREE = (window as any).THREE
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(5, 8, 5)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.shadowMap.enabled = true
    mountRef.current.innerHTML = ""
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new (THREE as any).OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.screenSpacePanning = false
    controls.maxPolarAngle = Math.PI / 2 - 0.1
    controlsRef.current = controls

    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.6)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 15, 5)
    directionalLight.castShadow = true
    scene.add(directionalLight)
  }, [threeLoaded])

  const createEnvironment = useCallback(
    (envType) => {
      if (!threeLoaded) return

      const THREE = (window as any).THREE
      const scene = sceneRef.current
      if (!scene) return
      const existingEnv = scene.getObjectByName("environment")
      if (existingEnv) scene.remove(existingEnv)

      const envGroup = new THREE.Group()
      envGroup.name = "environment"
      const env = environments[envType]
      const { size, obstacles, goals } = env
      const centerOffset = { x: size.x / 2 - 0.5, z: size.y / 2 - 0.5 }
      if (controlsRef.current) {
        controlsRef.current.target.set(centerOffset.x, 0, centerOffset.z)
      }

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x, size.y),
        new THREE.MeshStandardMaterial({ color: 0x2a2a3e, roughness: 0.8 }),
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.set(centerOffset.x, 0, centerOffset.z)
      floor.receiveShadow = true
      envGroup.add(floor)

      obstacles.forEach(([x, y]) => {
        const obstacle = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 1, 0.8),
          new THREE.MeshStandardMaterial({ color: 0xff4444, roughness: 0.5 }),
        )
        obstacle.position.set(x, 0.5, y)
        obstacle.castShadow = true
        envGroup.add(obstacle)
      })
      goals.forEach(([x, y]) => {
        const goal = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16),
          new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x44ff44, emissiveIntensity: 0.5 }),
        )
        goal.position.set(x, 0.05, y)
        envGroup.add(goal)
      })
      scene.add(envGroup)
    },
    [threeLoaded],
  )

  const createAgent = useCallback(
    (position, id = 0) => {
      if (!threeLoaded) return null

      const THREE = (window as any).THREE
      const agent = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 16, 16),
        new THREE.MeshStandardMaterial({ color: id === 0 ? 0x4488ff : 0xff44ff, roughness: 0.3 }),
      )
      agent.position.set(position[0], 0.2, position[1])
      agent.castShadow = true
      agent.name = `agent_${id}`
      return agent
    },
    [threeLoaded],
  )

  const createQValueVisualization = useCallback(() => {
    if (!threeLoaded) return

    const THREE = (window as any).THREE
    const scene = sceneRef.current
    if (!scene) return
    const existingQViz = scene.getObjectByName("qvalues")
    if (existingQViz) scene.remove(existingQViz)
    if (!policy || !showQValues || policy.type !== "q_table") return

    const qGroup = new THREE.Group()
    qGroup.name = "qvalues"
    const { size } = environments[selectedEnvironment]
    for (let x = 0; x < size.x; x++) {
      for (let y = 0; y < size.y; y++) {
        const stateIndex = y * size.x + x
        const qValues = policy.values[stateIndex]
        if (qValues) {
          const maxQ = Math.max(...qValues)
          const bestActionIndex = qValues.indexOf(maxQ)
          const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.25, 8),
            new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 }),
          )
          const offsets = [
            [0, 0.2, -0.2],
            [0, 0.2, 0.2],
            [-0.2, 0.2, 0],
            [0.2, 0.2, 0],
          ]
          const rotations = [0, Math.PI, -Math.PI / 2, Math.PI / 2]
          arrow.position.set(
            x + offsets[bestActionIndex][0],
            offsets[bestActionIndex][1],
            y + offsets[bestActionIndex][2],
          )
          arrow.rotation.z = rotations[bestActionIndex]
          qGroup.add(arrow)
        }
      }
    }
    scene.add(qGroup)
  }, [policy, selectedEnvironment, showQValues, threeLoaded])

  const initializeSimulation = useCallback(() => {
    if (!threeLoaded) return

    const scene = sceneRef.current
    if (!scene) return
    scene.children
      .filter((c) => c.name?.startsWith("agent_") || c.name === "trajectory_line" || c.name === "qvalues")
      .forEach((obj) => scene.remove(obj))
    createEnvironment(selectedEnvironment)
    const envConfig = environments[selectedEnvironment]
    const startPositions = Array.isArray(envConfig.start[0]) ? envConfig.start : [envConfig.start]
    startPositions.forEach((position, index) => {
      const agent = createAgent(position, index)
      if (agent) {
        scene.add(agent)
        if (index === 0) {
          const THREE = (window as any).THREE
          setTrajectory([new THREE.Vector3(position[0], 0.2, position[1])])
        }
      }
    })
    setCurrentStep(0)
    setMetrics({ totalReward: 0, steps: 0 })
    setRewardHistory([])
    createQValueVisualization()
  }, [selectedEnvironment, createEnvironment, createAgent, createQValueVisualization, threeLoaded])

  const simulationStep = useCallback(() => {
    if (!policy || !threeLoaded) return

    const THREE = (window as any).THREE
    const scene = sceneRef.current
    const agentMesh = scene.getObjectByName("agent_0")
    const envConfig = environments[selectedEnvironment]
    if (!agentMesh) return

    const currentState = [Math.round(agentMesh.position.x), Math.round(agentMesh.position.z)]
    const stateIndex = currentState[1] * envConfig.size.x + currentState[0]
    const qValues = policy.values[stateIndex]
    const actionIndex = qValues ? qValues.indexOf(Math.max(...qValues)) : Math.floor(Math.random() * 4)

    const actions = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]
    const [dx, dz] = actions[actionIndex]
    const newX = Math.max(0, Math.min(envConfig.size.x - 1, currentState[0] + dx))
    const newZ = Math.max(0, Math.min(envConfig.size.y - 1, currentState[1] + dz))
    const isObstacle = envConfig.obstacles.some((obs) => obs[0] === newX && obs[1] === newZ)
    const goalReached = envConfig.goals.some((g) => g[0] === newX && g[1] === newZ)
    let reward = -0.01 // Cost of living

    if (isObstacle) {
      reward = -1.0
    } else {
      agentMesh.position.x = newX
      agentMesh.position.z = newZ
      setTrajectory((prev) => [...prev, new THREE.Vector3(newX, 0.2, newZ)])
    }
    if (goalReached) reward = 10.0

    setMetrics((prev) => ({ steps: prev.steps + 1, totalReward: prev.totalReward + reward }))
    setRewardHistory((prev) => [...prev, reward])
    setCurrentStep((prev) => prev + 1)

    if (goalReached || metrics.steps > 100) {
      if (goalReached) setStepsPerEpisode((prev) => [...prev, metrics.steps + 1])
      setIsRunning(false)
      setTimeout(() => {
        setCurrentEpisode((e) => e + 1)
        initializeSimulation()
        if (goalReached) setIsRunning(true)
      }, 500)
    }
  }, [policy, selectedEnvironment, metrics.steps, initializeSimulation, threeLoaded])

  const animate = useCallback(() => {
    if (!threeLoaded) return

    animationRef.current.id = requestAnimationFrame(animate)
    if (isRunning) {
      const now = Date.now()
      const stepInterval = 1000 / simulationSpeed
      if (!animationRef.current.lastStep || now - animationRef.current.lastStep > stepInterval) {
        simulationStep()
        animationRef.current.lastStep = now
      }
    }
    if (controlsRef.current) controlsRef.current.update()
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }, [isRunning, simulationSpeed, simulationStep, threeLoaded])

  const handleReset = useCallback(() => {
    setIsRunning(false)
    setCurrentEpisode(1)
    setStepsPerEpisode([])
    initializeSimulation()
  }, [initializeSimulation])

  useEffect(() => {
    loadThreeJS()
      .then(() => {
        setThreeLoaded(true)
      })
      .catch((error) => {
        console.error("Failed to load Three.js:", error)
      })
  }, [])

  useEffect(() => {
    if (!threeLoaded) return

    initializeScene()
    animate()
    return () => {
      if (animationRef.current.id) {
        cancelAnimationFrame(animationRef.current.id)
      }
      if (rendererRef.current) rendererRef.current.dispose()
      if (mountRef.current) mountRef.current.innerHTML = ""
    }
  }, [initializeScene, animate, threeLoaded])

  useEffect(() => {
    if (threeLoaded) {
      handleReset()
    }
  }, [selectedEnvironment, threeLoaded])

  useEffect(() => {
    if (threeLoaded) {
      createQValueVisualization()
    }
  }, [createQValueVisualization, threeLoaded])

  useEffect(() => {
    if (!threeLoaded) return

    const THREE = (window as any).THREE
    const scene = sceneRef.current
    if (!scene) return
    const oldLine = scene.getObjectByName("trajectory_line")
    if (oldLine) scene.remove(oldLine)
    if (showTrajectories && trajectory.length > 1) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(trajectory),
        new THREE.LineBasicMaterial({ color: 0xffff00 }),
      )
      line.name = "trajectory_line"
      scene.add(line)
    }
  }, [trajectory, showTrajectories, threeLoaded])

  useEffect(() => {
    const handleResize = () => {
      if (mountRef.current && rendererRef.current && cameraRef.current) {
        const { clientWidth: width, clientHeight: height } = mountRef.current
        cameraRef.current.aspect = width / height
        cameraRef.current.updateProjectionMatrix()
        rendererRef.current.setSize(width, height)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const uploadedPolicy = JSON.parse(e.target.result)
        if (uploadedPolicy.type && Array.isArray(uploadedPolicy.values)) {
          setPolicy(uploadedPolicy)
          handleReset()
        } else {
          console.error("Invalid policy file format.")
        }
      } catch (error) {
        console.error("Error parsing policy file:", error)
      }
    }
    reader.readAsText(file)
  }

  if (!threeLoaded) {
    return (
      <div className="h-screen w-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <Bot className="w-16 h-16 text-indigo-400 mx-auto mb-4 animate-pulse" />
          <h2 className="text-xl font-semibold mb-2">Loading 3D Engine...</h2>
          <p className="text-gray-400">Initializing Three.js components</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex flex-col font-sans">
      <header className="bg-gray-800 p-3 border-b border-gray-700 flex items-center justify-between shadow-md">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bot className="w-6 h-6 text-indigo-400" />
          3D RL Policy Simulator
        </h1>
        <div className="text-sm font-mono bg-gray-900 px-3 py-1 rounded">
          <span>Ep: {currentEpisode}</span>
          <span className="ml-4">Step: {currentStep}</span>
          <span className="ml-4">Reward: {metrics.totalReward.toFixed(2)}</span>
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-gray-800 p-4 border-r border-gray-700 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-3">Controls</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setIsRunning(true)}
              disabled={isRunning || !policy}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              Play
            </button>
            <button
              onClick={() => setIsRunning(false)}
              disabled={!isRunning}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
            <button
              onClick={() => !isRunning && simulationStep()}
              disabled={isRunning || !policy}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <SkipForward className="w-4 h-4" />
              Step
            </button>
            <button
              onClick={handleReset}
              className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
          <label className="block text-sm font-medium mb-2">Speed: {simulationSpeed}x</label>
          <input
            type="range"
            min="0.5"
            max="20"
            step="0.5"
            value={simulationSpeed}
            onChange={(e) => setSimulationSpeed(Number.parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />

          <h3 className="text-lg font-semibold mt-6 mb-3 flex items-center gap-2">
            <Grid3x3 className="w-5 h-5" />
            Environment
          </h3>
          <select
            value={selectedEnvironment}
            onChange={(e) => setSelectedEnvironment(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 mb-3 text-white"
          >
            {Object.entries(environments).map(([key, env]) => (
              <option key={key} value={key}>
                {env.name}
              </option>
            ))}
          </select>

          <h3 className="text-lg font-semibold mt-6 mb-3 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Policy
          </h3>
          <label className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-600 flex items-center justify-center transition-colors">
            <span>{policy ? "Policy Loaded" : "Upload .json Policy"}</span>
            <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
          </label>

          <h3 className="text-lg font-semibold mt-6 mb-3 flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Visualization
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showQValues}
                onChange={(e) => setShowQValues(e.target.checked)}
                className="rounded"
              />
              Show Best Action
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTrajectories}
                onChange={(e) => setShowTrajectories(e.target.checked)}
                className="rounded"
              />
              Show Trajectories
            </label>
          </div>

          <div className="mt-6">
            <button
              onClick={() => setShowDashboard(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </button>
          </div>
        </aside>
        <main className="flex-1 relative">
          <div ref={mountRef} className="w-full h-full" />
          <div className="absolute top-4 right-4 bg-black bg-opacity-50 p-3 rounded-lg text-sm font-mono">
            <div>
              <span className="font-bold text-gray-400">Env:</span> {environments[selectedEnvironment].name}
            </div>
            <div>
              <span className="font-bold text-gray-400">Policy:</span>{" "}
              <span className={policy ? "text-green-400" : "text-yellow-400"}>{policy ? "Loaded" : "None"}</span>
            </div>
            <div>
              <span className="font-bold text-gray-400">Status:</span>{" "}
              <span className={isRunning ? "text-green-400" : "text-red-400"}>{isRunning ? "Running" : "Paused"}</span>
            </div>
          </div>
        </main>
      </div>
      {showDashboard && (
        <Dashboard
          rewardHistory={rewardHistory}
          stepsPerEpisode={stepsPerEpisode}
          onClose={() => setShowDashboard(false)}
        />
      )}
    </div>
  )
}

export default App
