var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  ref() {
  }
  unref() {
  }
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  mainModule = void 0;
  domain = void 0;
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var { exit, platform, nextTick } = getBuiltinModule(
  "node:process"
);
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  nextTick
});
var {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  finalization,
  features,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  on,
  off,
  once,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// node_modules/@cloudflare/containers/dist/index.mjs
import { DurableObject } from "cloudflare:workers";
function generateId(length = 9) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}
__name(generateId, "generateId");
function parseTimeExpression(timeExpression) {
  if (typeof timeExpression === "number") {
    return timeExpression;
  }
  if (typeof timeExpression === "string") {
    const match = timeExpression.match(/^(\d+)([smh])$/);
    if (!match) {
      throw new Error(`invalid time expression ${timeExpression}`);
    }
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 60 * 60;
      default:
        throw new Error(`unknown time unit ${unit}`);
    }
  }
  throw new Error(`invalid type for a time expression: ${typeof timeExpression}`);
}
__name(parseTimeExpression, "parseTimeExpression");
var NO_CONTAINER_INSTANCE_ERROR = "there is no container instance that can be provided to this durable object";
var RUNTIME_SIGNALLED_ERROR = "runtime signalled the container to exit:";
var UNEXPECTED_EDIT_ERROR = "container exited with unexpected exit code:";
var NOT_LISTENING_ERROR = "the container is not listening";
var CONTAINER_STATE_KEY = "__CF_CONTAINER_STATE";
var MAX_ALAEM_RETRIES = 3;
var DEFAULT_SLEEP_AFTER = "10m";
var INSTANCE_POLL_INTERVAL_MS = 300;
var TIMEOUT_TO_GET_CONTAINER_SECONDS = 8;
var TIMEOUT_TO_GET_PORTS = 20;
var TRIES_TO_GET_CONTAINER = Math.ceil(
  TIMEOUT_TO_GET_CONTAINER_SECONDS * 1e3 / INSTANCE_POLL_INTERVAL_MS
);
var TRIES_TO_GET_PORTS = Math.ceil(TIMEOUT_TO_GET_PORTS * 1e3 / INSTANCE_POLL_INTERVAL_MS);
var FALLBACK_PORT_TO_CHECK = 33;
var TEMPORARY_HARDCODED_ATTEMPT_MAX = 6;
function isErrorOfType(e, matchingString) {
  const errorString = e instanceof Error ? e.message : String(e);
  return errorString.includes(matchingString);
}
__name(isErrorOfType, "isErrorOfType");
var isNoInstanceError = /* @__PURE__ */ __name((error3) => isErrorOfType(error3, NO_CONTAINER_INSTANCE_ERROR), "isNoInstanceError");
var isRuntimeSignalledError = /* @__PURE__ */ __name((error3) => isErrorOfType(error3, RUNTIME_SIGNALLED_ERROR), "isRuntimeSignalledError");
var isNotListeningError = /* @__PURE__ */ __name((error3) => isErrorOfType(error3, NOT_LISTENING_ERROR), "isNotListeningError");
var isContainerExitNonZeroError = /* @__PURE__ */ __name((error3) => isErrorOfType(error3, UNEXPECTED_EDIT_ERROR), "isContainerExitNonZeroError");
function getExitCodeFromError(error3) {
  if (!(error3 instanceof Error)) {
    return null;
  }
  if (isRuntimeSignalledError(error3)) {
    return +error3.message.toLowerCase().slice(
      error3.message.toLowerCase().indexOf(RUNTIME_SIGNALLED_ERROR) + RUNTIME_SIGNALLED_ERROR.length + 1
    );
  }
  if (isContainerExitNonZeroError(error3)) {
    return +error3.message.toLowerCase().slice(
      error3.message.toLowerCase().indexOf(UNEXPECTED_EDIT_ERROR) + UNEXPECTED_EDIT_ERROR.length + 1
    );
  }
  return null;
}
__name(getExitCodeFromError, "getExitCodeFromError");
function attachOnClosedHook(stream, onClosed) {
  let destructor = /* @__PURE__ */ __name(() => {
    onClosed();
    destructor = null;
  }, "destructor");
  const transformStream = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush() {
      if (destructor) {
        destructor();
      }
    },
    cancel() {
      if (destructor) {
        destructor();
      }
    }
  });
  return stream.pipeThrough(transformStream);
}
__name(attachOnClosedHook, "attachOnClosedHook");
var ContainerState = class {
  static {
    __name(this, "ContainerState");
  }
  constructor(storage) {
    this.storage = storage;
  }
  status;
  async setRunning() {
    await this.setStatusAndupdate("running");
  }
  async setHealthy() {
    await this.setStatusAndupdate("healthy");
  }
  async setStopping() {
    await this.setStatusAndupdate("stopping");
  }
  async setStopped() {
    await this.setStatusAndupdate("stopped");
  }
  async setStoppedWithCode(exitCode2) {
    this.status = { status: "stopped_with_code", lastChange: Date.now(), exitCode: exitCode2 };
    await this.update();
  }
  async getState() {
    if (!this.status) {
      const state = await this.storage.get(CONTAINER_STATE_KEY);
      if (!state) {
        this.status = {
          status: "stopped",
          lastChange: Date.now()
        };
        await this.update();
      } else {
        this.status = state;
      }
    }
    return this.status;
  }
  async setStatusAndupdate(status) {
    this.status = { status, lastChange: Date.now() };
    await this.update();
  }
  async update() {
    if (!this.status) throw new Error("status should be init");
    await this.storage.put(CONTAINER_STATE_KEY, this.status);
  }
};
var Container = class extends DurableObject {
  static {
    __name(this, "Container");
  }
  // =========================
  //     Public Attributes
  // =========================
  // Default port for the container (undefined means no default port)
  defaultPort;
  // Required ports that should be checked for availability during container startup
  // Override this in your subclass to specify ports that must be ready
  requiredPorts;
  // Timeout after which the container will sleep if no activity
  // The signal sent to the container by default is a SIGTERM.
  // The container won't get a SIGKILL if this threshold is triggered.
  sleepAfter = DEFAULT_SLEEP_AFTER;
  // Container configuration properties
  // Set these properties directly in your container instance
  envVars = {};
  entrypoint;
  enableInternet = true;
  // =========================
  //     PUBLIC INTERFACE
  // =========================
  constructor(ctx, env2, options) {
    super(ctx, env2);
    this.state = new ContainerState(this.ctx.storage);
    this.ctx.blockConcurrencyWhile(async () => {
      this.renewActivityTimeout();
      await this.scheduleNextAlarm();
    });
    if (ctx.container === void 0) {
      throw new Error(
        "Container is not enabled for this durable object class. Have you correctly setup your wrangler.toml?"
      );
    }
    this.container = ctx.container;
    if (options) {
      if (options.defaultPort !== void 0) this.defaultPort = options.defaultPort;
      if (options.sleepAfter !== void 0) this.sleepAfter = options.sleepAfter;
    }
    this.sql`
      CREATE TABLE IF NOT EXISTS container_schedules (
        id TEXT PRIMARY KEY NOT NULL DEFAULT (randomblob(9)),
        callback TEXT NOT NULL,
        payload TEXT,
        type TEXT NOT NULL CHECK(type IN ('scheduled', 'delayed')),
        time INTEGER NOT NULL,
        delayInSeconds INTEGER,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `;
  }
  // ==========================
  //     CONTAINER STARTING
  // ==========================
  /**
   * Start the container if it's not running and set up monitoring
   *
   * This method handles the core container startup process without waiting for ports to be ready.
   * It will automatically retry if the container fails to start, up to maxTries attempts.
   *
   * It's useful when you need to:
   * - Start a container without blocking until a port is available
   * - Initialize a container that doesn't expose ports
   * - Perform custom port availability checks separately
   *
   * The method applies the container configuration from your instance properties by default, but allows
   * overriding these values for this specific startup:
   * - Environment variables (defaults to this.envVars)
   * - Custom entrypoint commands (defaults to this.entrypoint)
   * - Internet access settings (defaults to this.enableInternet)
   *
   * It also sets up monitoring to track container lifecycle events and automatically
   * calls the onStop handler when the container terminates.
   *
   * @example
   * // Basic usage in a custom Container implementation
   * async customInitialize() {
   *   // Start the container without waiting for a port
   *   await this.start();
   *
   *   // Perform additional initialization steps
   *   // that don't require port access
   * }
   *
   * @example
   * // Start with custom configuration
   * await this.start({
   *   envVars: { DEBUG: 'true', NODE_ENV: 'development' },
   *   entrypoint: ['npm', 'run', 'dev'],
   *   enableInternet: false
   * });
   *
   * @param options - Optional configuration to override instance defaults
   * @param waitOptions - Optional wait configuration with abort signal for cancellation
   * @returns A promise that resolves when the container start command has been issued
   * @throws Error if no container context is available or if all start attempts fail
   */
  async start(options, waitOptions) {
    const portToCheck = this.defaultPort ?? (this.requiredPorts ? this.requiredPorts[0] : FALLBACK_PORT_TO_CHECK);
    await this.startContainerIfNotRunning(
      {
        abort: waitOptions?.signal,
        waitInterval: INSTANCE_POLL_INTERVAL_MS,
        retries: TRIES_TO_GET_CONTAINER,
        portToCheck
      },
      options
    );
    this.setupMonitor();
  }
  /**
   * Start the container and wait for ports to be available
   * Based on containers-starter-go implementation
   *
   * This method builds on start() by adding port availability verification:
   * 1. Calls start() to ensure the container is running
   * 2. If no ports are specified and requiredPorts is not set, it uses defaultPort (if set)
   * 3. If no ports can be determined, it calls onStart and renewActivityTimeout immediately
   * 4. For each specified port, it polls until the port is available or maxTries is reached
   * 5. When all ports are available, it triggers onStart and renewActivityTimeout
   *
   * The method prioritizes port sources in this order:
   * 1. Ports specified directly in the method call
   * 2. requiredPorts class property (if set)
   * 3. defaultPort (if neither of the above is specified)
   *
   * @param ports - The ports to wait for (if undefined, uses requiredPorts or defaultPort)
   * @param maxTries - Maximum number of attempts to connect to each port before failing
   * @throws Error if port checks fail after maxTries attempts
   */
  async startAndWaitForPorts(ports, cancellationOptions) {
    let portsToCheck = [];
    if (ports !== void 0) {
      portsToCheck = Array.isArray(ports) ? ports : [ports];
    } else if (this.requiredPorts && this.requiredPorts.length > 0) {
      portsToCheck = [...this.requiredPorts];
    } else if (this.defaultPort !== void 0) {
      portsToCheck = [this.defaultPort];
    }
    const state = await this.state.getState();
    cancellationOptions ??= {};
    let containerGetRetries = cancellationOptions.instanceGetTimeoutMS ? Math.ceil(cancellationOptions.instanceGetTimeoutMS / INSTANCE_POLL_INTERVAL_MS) : TRIES_TO_GET_CONTAINER;
    cancellationOptions ??= {};
    let totalPortReadyTries = cancellationOptions.portReadyTimeoutMS ? Math.ceil(cancellationOptions.portReadyTimeoutMS / INSTANCE_POLL_INTERVAL_MS) : TRIES_TO_GET_PORTS;
    const options = {
      abort: cancellationOptions.abort,
      retries: containerGetRetries,
      waitInterval: cancellationOptions.waitInterval ?? INSTANCE_POLL_INTERVAL_MS,
      portToCheck: portsToCheck[0] ?? FALLBACK_PORT_TO_CHECK
    };
    if (state.status === "healthy" && this.container.running) {
      if (this.container.running && !this.monitor) {
        await this.startContainerIfNotRunning(options);
        this.setupMonitor();
      }
      return;
    }
    await this.syncPendingStoppedEvents();
    const abortedSignal = new Promise((res) => {
      options.abort?.addEventListener("abort", () => {
        res(true);
      });
    });
    const errorFromBCW = await this.blockConcurrencyThrowable(async () => {
      const triesUsed = await this.startContainerIfNotRunning(options);
      const triesLeft = totalPortReadyTries - triesUsed;
      for (const port of portsToCheck) {
        const tcpPort = this.container.getTcpPort(port);
        let portReady = false;
        for (let i = 0; i < triesLeft && !portReady; i++) {
          try {
            await tcpPort.fetch("http://ping", { signal: options.abort });
            portReady = true;
            console.log(`Port ${port} is ready`);
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.warn(`Error checking ${port}: ${errorMessage}`);
            if (!this.container.running) {
              try {
                await this.onError(
                  new Error(
                    `Container crashed while checking for ports, did you setup the entrypoint correctly?`
                  )
                );
              } catch {
              }
              throw e;
            }
            if (i === triesLeft - 1) {
              try {
                this.onError(
                  `Failed to verify port ${port} is available after ${options.retries} attempts, last error: ${errorMessage}`
                );
              } catch {
              }
              throw e;
            }
            await Promise.any([
              new Promise((resolve) => setTimeout(resolve, options.waitInterval)),
              abortedSignal
            ]);
            if (options.abort?.aborted) {
              throw new Error("Container request timed out.");
            }
          }
        }
      }
    });
    if (errorFromBCW) {
      throw errorFromBCW;
    }
    this.setupMonitor();
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.onStart();
      await this.state.setHealthy();
    });
  }
  // =======================
  //     LIFECYCLE HOOKS
  // =======================
  /**
   * Shuts down the container.
   * @param signal - The signal to send to the container (default: 15 for SIGTERM)
   */
  async stop(signal = 15) {
    this.container.signal(signal);
  }
  /**
   * Destroys the container. It will trigger onError instead of onStop.
   */
  async destroy() {
    await this.container.destroy();
  }
  /**
   * Lifecycle method called when container starts successfully
   * Override this method in subclasses to handle container start events
   */
  onStart() {
  }
  /**
   * Lifecycle method called when container shuts down
   * Override this method in subclasses to handle Container stopped events
   * @param params - Object containing exitCode and reason for the stop
   */
  onStop(_) {
  }
  /**
   * Error handler for container errors
   * Override this method in subclasses to handle container errors
   * @param error - The error that occurred
   * @returns Can return any value or throw the error
   */
  onError(error3) {
    console.error("Container error:", error3);
    throw error3;
  }
  /**
   * Renew the container's activity timeout
   *
   * Call this method whenever there is activity on the container
   */
  renewActivityTimeout() {
    const timeoutInMs = parseTimeExpression(this.sleepAfter) * 1e3;
    this.sleepAfterMs = Date.now() + timeoutInMs;
  }
  // ==================
  //     SCHEDULING
  // ==================
  /**
   * Schedule a task to be executed in the future
   * @template T Type of the payload data
   * @param when When to execute the task (Date object or number of seconds delay)
   * @param callback Name of the method to call
   * @param payload Data to pass to the callback
   * @returns Schedule object representing the scheduled task
   */
  async schedule(when, callback, payload) {
    const id = generateId(9);
    if (typeof callback !== "string") {
      throw new Error("Callback must be a string (method name)");
    }
    if (typeof this[callback] !== "function") {
      throw new Error(`this.${callback} is not a function`);
    }
    if (when instanceof Date) {
      const timestamp = Math.floor(when.getTime() / 1e3);
      this.sql`
        INSERT OR REPLACE INTO container_schedules (id, callback, payload, type, time)
        VALUES (${id}, ${callback}, ${JSON.stringify(payload)}, 'scheduled', ${timestamp})
      `;
      await this.scheduleNextAlarm();
      return {
        taskId: id,
        callback,
        payload,
        time: timestamp,
        type: "scheduled"
      };
    }
    if (typeof when === "number") {
      const time3 = Math.floor(Date.now() / 1e3 + when);
      this.sql`
        INSERT OR REPLACE INTO container_schedules (id, callback, payload, type, delayInSeconds, time)
        VALUES (${id}, ${callback}, ${JSON.stringify(payload)}, 'delayed', ${when}, ${time3})
      `;
      await this.scheduleNextAlarm();
      return {
        taskId: id,
        callback,
        payload,
        delayInSeconds: when,
        time: time3,
        type: "delayed"
      };
    }
    throw new Error("Invalid schedule type. 'when' must be a Date or number of seconds");
  }
  // ============
  //     HTTP
  // ============
  /**
   * Send a request to the container (HTTP or WebSocket) using standard fetch API signature
   * Based on containers-starter-go implementation
   *
   * This method handles both HTTP and WebSocket requests to the container.
   * For WebSocket requests, it sets up bidirectional message forwarding with proper
   * activity timeout renewal.
   *
   * Method supports multiple signatures to match standard fetch API:
   * - containerFetch(request: Request, port?: number)
   * - containerFetch(url: string | URL, init?: RequestInit, port?: number)
   *
   * @param requestOrUrl The request object or URL string/object to send to the container
   * @param portOrInit Port number or fetch RequestInit options
   * @param portParam Optional port number when using URL+init signature
   * @returns A Response from the container, or WebSocket connection
   */
  async containerFetch(requestOrUrl, portOrInit, portParam) {
    let { request, port } = this.requestAndPortFromContainerFetchArgs(
      requestOrUrl,
      portOrInit,
      portParam
    );
    const state = await this.state.getState();
    if (!this.container.running || state.status !== "healthy") {
      try {
        await this.startAndWaitForPorts(port, { abort: request.signal });
      } catch (e) {
        if (isNoInstanceError(e)) {
          return new Response(
            "There is no Container instance available at this time.\nThis is likely because you have reached your max concurrent instance count (set in wrangler config) or are you currently provisioning the Container.\nIf you are deploying your Container for the first time, check your dashboard to see provisioning status, this may take a few minutes.",
            { status: 503 }
          );
        } else {
          return new Response(
            `Failed to start container: ${e instanceof Error ? e.message : String(e)}`,
            { status: 500 }
          );
        }
      }
    }
    const tcpPort = this.container.getTcpPort(port);
    const containerUrl = request.url.replace("https:", "http:");
    try {
      this.renewActivityTimeout();
      if (request.body != null) {
        this.openStreamCount++;
        const destructor = /* @__PURE__ */ __name(() => {
          this.openStreamCount--;
          this.renewActivityTimeout();
        }, "destructor");
        const readable = attachOnClosedHook(request.body, destructor);
        request = new Request(request, { body: readable });
      }
      const res = await tcpPort.fetch(containerUrl, request);
      if (res.webSocket) {
        this.openStreamCount++;
        res.webSocket.addEventListener("close", async () => {
          this.openStreamCount--;
          this.renewActivityTimeout();
        });
      } else if (res.body != null) {
        this.openStreamCount++;
        const destructor = /* @__PURE__ */ __name(() => {
          this.openStreamCount--;
          this.renewActivityTimeout();
        }, "destructor");
        const readable = attachOnClosedHook(res.body, destructor);
        return new Response(readable, res);
      }
      return res;
    } catch (e) {
      console.error(`Error proxying request to container ${this.ctx.id}:`, e);
      return new Response(
        `Error proxying request to container: ${e instanceof Error ? e.message : String(e)}`,
        { status: 500 }
      );
    }
  }
  /**
   * Handle fetch requests to the Container
   * Default implementation forwards all HTTP and WebSocket requests to the container
   * Override this in your subclass to specify a port or implement custom request handling
   *
   * @param request The request to handle
   */
  async fetch(request) {
    if (this.defaultPort === void 0) {
      return new Response(
        "No default port configured for this container. Override the fetch method or set defaultPort in your Container subclass.",
        { status: 500 }
      );
    }
    return await this.containerFetch(request, this.defaultPort);
  }
  // ===============================
  // ===============================
  //     PRIVATE METHODS & ATTRS
  // ===============================
  // ===============================
  // ==========================
  //     PRIVATE ATTRIBUTES
  // ==========================
  container;
  state;
  monitor;
  monitorSetup = false;
  // openStreamCount keeps track of the number of open streams to the container
  openStreamCount = 0;
  sleepAfterMs = 0;
  alarmSleepPromise;
  alarmSleepResolve = /* @__PURE__ */ __name((_) => {
  }, "alarmSleepResolve");
  // ==========================
  //     GENERAL HELPERS
  // ==========================
  // This wraps blockConcurrencyWhile so you can throw in it,
  // then check for a string return value that you can throw from the parent
  // Note that the DO will continue to run, unlike normal errors in blockConcurrencyWhile
  async blockConcurrencyThrowable(blockingFunction) {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        return await blockingFunction();
      } catch (e) {
        return `${e instanceof Error ? e.message : String(e)}`;
      }
    });
  }
  /**
   * Try-catch wrapper for async operations
   */
  async tryCatch(fn) {
    try {
      return await fn();
    } catch (e) {
      this.onError(e);
      throw e;
    }
  }
  /**
   * Execute SQL queries against the Container's database
   */
  sql(strings, ...values) {
    let query = "";
    try {
      query = strings.reduce((acc, str, i) => acc + str + (i < values.length ? "?" : ""), "");
      return [...this.ctx.storage.sql.exec(query, ...values)];
    } catch (e) {
      console.error(`Failed to execute SQL query: ${query}`, e);
      throw this.onError(e);
    }
  }
  requestAndPortFromContainerFetchArgs(requestOrUrl, portOrInit, portParam) {
    let request;
    let port;
    if (requestOrUrl instanceof Request) {
      request = requestOrUrl;
      port = typeof portOrInit === "number" ? portOrInit : void 0;
    } else {
      const url = typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.toString();
      const init = typeof portOrInit === "number" ? {} : portOrInit || {};
      port = typeof portOrInit === "number" ? portOrInit : typeof portParam === "number" ? portParam : void 0;
      request = new Request(url, init);
    }
    if (port === void 0 && this.defaultPort === void 0) {
      throw new Error(
        "No port specified for container fetch. Set defaultPort or specify a port parameter."
      );
    }
    port = port ?? this.defaultPort;
    return { request, port };
  }
  // ===========================================
  //     CONTAINER INTERACTION & MONITORING
  // ===========================================
  // Tries to start a container if it's not running
  // Reutns the number of tries used
  async startContainerIfNotRunning(waitOptions, options) {
    if (this.container.running) {
      if (!this.monitor) {
        this.monitor = this.container.monitor();
      }
      return 0;
    }
    const abortedSignal = new Promise((res) => {
      waitOptions.abort?.addEventListener("abort", () => {
        res(true);
      });
    });
    await this.state.setRunning();
    for (let tries = 0; tries < waitOptions.retries; tries++) {
      const envVars = options?.envVars ?? this.envVars;
      const entrypoint = options?.entrypoint ?? this.entrypoint;
      const enableInternet = options?.enableInternet ?? this.enableInternet;
      const startConfig = {
        enableInternet
      };
      if (envVars && Object.keys(envVars).length > 0) startConfig.env = envVars;
      if (entrypoint) startConfig.entrypoint = entrypoint;
      this.renewActivityTimeout();
      const handleError = /* @__PURE__ */ __name(async () => {
        const err = await this.monitor?.catch((err2) => err2);
        if (typeof err === "number") {
          const toThrow = new Error(
            `Error starting container, early exit code 0 before we could check for healthiness, did it crash early?`
          );
          try {
            await this.onError(toThrow);
          } catch {
          }
          throw toThrow;
        } else if (!isNoInstanceError(err)) {
          try {
            await this.onError(err);
          } catch {
          }
          throw err;
        }
      }, "handleError");
      if (!this.container.running) {
        if (tries > 0) {
          await handleError();
        }
        await this.scheduleNextAlarm();
        this.container.start(startConfig);
        this.monitor = this.container.monitor();
      } else {
        await this.scheduleNextAlarm();
      }
      this.renewActivityTimeout();
      const port = this.container.getTcpPort(waitOptions.portToCheck);
      try {
        await port.fetch("http://containerstarthealthcheck", { signal: waitOptions.abort });
        return tries;
      } catch (error3) {
        if (isNotListeningError(error3) && this.container.running) {
          return tries;
        }
        if (!this.container.running && isNotListeningError(error3)) {
          try {
            await this.onError(new Error(`container crashed when checking if it was ready`));
          } catch {
          }
          throw error3;
        }
        console.warn(
          "Error checking if container is ready:",
          error3 instanceof Error ? error3.message : String(error3)
        );
        await Promise.any([
          new Promise((res) => setTimeout(res, waitOptions.waitInterval)),
          abortedSignal
        ]);
        if (waitOptions.abort?.aborted) {
          throw new Error(
            "Aborted waiting for container to start as we received a cancellation signal"
          );
        }
        if (TEMPORARY_HARDCODED_ATTEMPT_MAX === tries) {
          throw new Error(NO_CONTAINER_INSTANCE_ERROR);
        }
        continue;
      }
    }
    throw new Error(`Container did not start after ${waitOptions.retries} attempts`);
  }
  setupMonitor() {
    if (this.monitorSetup) {
      return;
    }
    this.monitorSetup = true;
    this.monitor?.then(async () => {
      const state = await this.state.getState();
      await this.ctx.blockConcurrencyWhile(async () => {
        const newState = await this.state.getState();
        if (newState.status !== state.status) {
          return;
        }
        await this.state.setStoppedWithCode(0);
        await this.onStop({ exitCode: 0, reason: "exit" });
        await this.state.setStopped();
      });
    }).catch(async (error3) => {
      if (isNoInstanceError(error3)) {
        return;
      }
      const exitCode2 = getExitCodeFromError(error3);
      if (exitCode2 !== null) {
        const state = await this.state.getState();
        this.ctx.blockConcurrencyWhile(async () => {
          const newState = await this.state.getState();
          if (newState.status !== state.status) {
            return;
          }
          await this.state.setStoppedWithCode(exitCode2);
          await this.onStop({
            exitCode: exitCode2,
            reason: isRuntimeSignalledError(error3) ? "runtime_signal" : "exit"
          });
          await this.state.setStopped();
        });
        return;
      }
      try {
        await this.onError(error3);
      } catch {
      }
    }).finally(() => {
      this.monitorSetup = false;
      this.alarmSleepResolve("monitor finally");
    });
  }
  // ============================
  //     ALARMS AND SCHEDULES
  // ============================
  /**
   * Method called when an alarm fires
   * Executes any scheduled tasks that are due
   */
  async alarm(alarmProps) {
    if (alarmProps.isRetry && alarmProps.retryCount > MAX_ALAEM_RETRIES) {
      const scheduleCount = Number(this.sql`SELECT COUNT(*) as count FROM container_schedules`[0]?.count) || 0;
      const hasScheduledTasks = scheduleCount > 0;
      if (hasScheduledTasks || this.container.running) {
        await this.scheduleNextAlarm();
      }
      return;
    }
    await this.scheduleNextAlarm();
    await this.tryCatch(async () => {
      const now = Math.floor(Date.now() / 1e3);
      const result = this.sql`
        SELECT * FROM container_schedules;
      `;
      let maxTime = 0;
      for (const row of result) {
        if (row.time > now) {
          maxTime = Math.max(maxTime, row.time * 1e3);
          continue;
        }
        const callback = this[row.callback];
        if (!callback || typeof callback !== "function") {
          console.error(`Callback ${row.callback} not found or is not a function`);
          continue;
        }
        const schedule = this.getSchedule(row.id);
        try {
          const payload = row.payload ? JSON.parse(row.payload) : void 0;
          await callback.call(this, payload, await schedule);
        } catch (e) {
          console.error(`Error executing scheduled callback "${row.callback}":`, e);
        }
        this.sql`DELETE FROM container_schedules WHERE id = ${row.id}`;
      }
      await this.syncPendingStoppedEvents();
      if (!this.container.running) {
        return;
      }
      if (this.isActivityExpired()) {
        await this.stopDueToInactivity();
        await this.ctx.storage.deleteAlarm();
        return;
      }
      let resolve = /* @__PURE__ */ __name((_) => {
      }, "resolve");
      this.alarmSleepPromise = new Promise((res) => {
        this.alarmSleepResolve = (val) => {
          res(val);
        };
        resolve = res;
      });
      maxTime = maxTime === 0 ? Date.now() + 60 * 3 * 1e3 : maxTime;
      maxTime = Math.min(maxTime, this.sleepAfterMs);
      const timeout = Math.max(0, maxTime - Date.now());
      const timeoutRef = setTimeout(() => {
        resolve("setTimeout");
      }, timeout);
      await this.alarmSleepPromise;
      clearTimeout(timeoutRef);
    });
  }
  // synchronises container state with the container source of truth to process events
  async syncPendingStoppedEvents() {
    const state = await this.state.getState();
    if (!this.container.running && state.status === "healthy") {
      await new Promise(
        (res) => (
          // setTimeout to process monitor() just in case
          setTimeout(async () => {
            await this.ctx.blockConcurrencyWhile(async () => {
              const newState = await this.state.getState();
              if (newState.status !== state.status) {
                return;
              }
              await this.onStop({ exitCode: 0, reason: "exit" });
              await this.state.setStopped();
            });
            res(true);
          })
        )
      );
      return;
    }
    if (!this.container.running && state.status === "stopped_with_code") {
      await new Promise(
        (res) => (
          // setTimeout to process monitor() just in case
          setTimeout(async () => {
            await this.ctx.blockConcurrencyWhile(async () => {
              const newState = await this.state.getState();
              if (newState.status !== state.status) {
                return;
              }
              await this.onStop({ exitCode: state.exitCode ?? 0, reason: "exit" });
              await this.state.setStopped();
              res(true);
            });
          })
        )
      );
      return;
    }
  }
  /**
   * Schedule the next alarm based on upcoming tasks
   * @private
   */
  async scheduleNextAlarm(ms = 1e3) {
    const existingAlarm = await this.ctx.storage.getAlarm();
    const nextTime = ms + Date.now();
    if (existingAlarm === null || existingAlarm > nextTime || existingAlarm < Date.now()) {
      await this.ctx.storage.setAlarm(nextTime);
      await this.ctx.storage.sync();
      this.alarmSleepResolve("scheduling next alarm");
    }
  }
  /**
   * Get a scheduled task by ID
   * @template T Type of the payload data
   * @param id ID of the scheduled task
   * @returns The Schedule object or undefined if not found
   */
  async getSchedule(id) {
    const result = this.sql`
      SELECT * FROM container_schedules WHERE id = ${id} LIMIT 1
    `;
    if (!result || result.length === 0) {
      return void 0;
    }
    const schedule = result[0];
    let payload;
    try {
      payload = JSON.parse(schedule.payload);
    } catch (e) {
      console.error(`Error parsing payload for schedule ${id}:`, e);
      payload = void 0;
    }
    if (schedule.type === "delayed") {
      return {
        taskId: schedule.id,
        callback: schedule.callback,
        payload,
        type: "delayed",
        time: schedule.time,
        delayInSeconds: schedule.delayInSeconds
      };
    }
    return {
      taskId: schedule.id,
      callback: schedule.callback,
      payload,
      type: "scheduled",
      time: schedule.time
    };
  }
  isActivityExpired() {
    return this.sleepAfterMs <= Date.now();
  }
  /**
   * Method called by scheduled task to stop the container due to inactivity
   */
  async stopDueToInactivity() {
    const alreadyStopped = !this.container.running;
    const hasOpenStream = this.openStreamCount > 0;
    if (alreadyStopped || hasOpenStream) {
      return;
    }
    await this.stop();
  }
};
async function getRandom(binding2, instances = 3) {
  const id = Math.floor(Math.random() * instances).toString();
  const objectId = binding2.idFromName(`instance-${id}`);
  return binding2.get(objectId);
}
__name(getRandom, "getRandom");
async function loadBalance(binding2, instances = 3) {
  console.warn(
    "loadBalance is deprecated, please use getRandom instead. This will be removed in a future version."
  );
  return getRandom(binding2, instances);
}
__name(loadBalance, "loadBalance");
var singletonContainerId = "cf-singleton-container";
function getContainer(binding2, name) {
  const objectId = binding2.idFromName(name ?? singletonContainerId);
  return binding2.get(objectId);
}
__name(getContainer, "getContainer");

// node_modules/@tsndr/cloudflare-worker-jwt/index.js
function bytesToByteString(bytes) {
  let byteStr = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    byteStr += String.fromCharCode(bytes[i]);
  }
  return byteStr;
}
__name(bytesToByteString, "bytesToByteString");
function byteStringToBytes(byteStr) {
  let bytes = new Uint8Array(byteStr.length);
  for (let i = 0; i < byteStr.length; i++) {
    bytes[i] = byteStr.charCodeAt(i);
  }
  return bytes;
}
__name(byteStringToBytes, "byteStringToBytes");
function arrayBufferToBase64String(arrayBuffer) {
  return btoa(bytesToByteString(new Uint8Array(arrayBuffer)));
}
__name(arrayBufferToBase64String, "arrayBufferToBase64String");
function base64StringToUint8Array(b64str) {
  return byteStringToBytes(atob(b64str));
}
__name(base64StringToUint8Array, "base64StringToUint8Array");
function textToUint8Array(str) {
  return byteStringToBytes(str);
}
__name(textToUint8Array, "textToUint8Array");
function arrayBufferToBase64Url(arrayBuffer) {
  return arrayBufferToBase64String(arrayBuffer).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(arrayBufferToBase64Url, "arrayBufferToBase64Url");
function base64UrlToUint8Array(b64url) {
  return base64StringToUint8Array(b64url.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""));
}
__name(base64UrlToUint8Array, "base64UrlToUint8Array");
function textToBase64Url(str) {
  const encoder = new TextEncoder();
  const charCodes = encoder.encode(str);
  const binaryStr = String.fromCharCode(...charCodes);
  return btoa(binaryStr).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(textToBase64Url, "textToBase64Url");
function pemToBinary(pem) {
  return base64StringToUint8Array(pem.replace(/-+(BEGIN|END).*/g, "").replace(/\s/g, ""));
}
__name(pemToBinary, "pemToBinary");
async function importTextSecret(key, algorithm, keyUsages) {
  return await crypto.subtle.importKey("raw", textToUint8Array(key), algorithm, true, keyUsages);
}
__name(importTextSecret, "importTextSecret");
async function importJwk(key, algorithm, keyUsages) {
  return await crypto.subtle.importKey("jwk", key, algorithm, true, keyUsages);
}
__name(importJwk, "importJwk");
async function importPublicKey(key, algorithm, keyUsages) {
  return await crypto.subtle.importKey("spki", pemToBinary(key), algorithm, true, keyUsages);
}
__name(importPublicKey, "importPublicKey");
async function importPrivateKey(key, algorithm, keyUsages) {
  return await crypto.subtle.importKey("pkcs8", pemToBinary(key), algorithm, true, keyUsages);
}
__name(importPrivateKey, "importPrivateKey");
async function importKey(key, algorithm, keyUsages) {
  if (typeof key === "object")
    return importJwk(key, algorithm, keyUsages);
  if (typeof key !== "string")
    throw new Error("Unsupported key type!");
  if (key.includes("PUBLIC"))
    return importPublicKey(key, algorithm, keyUsages);
  if (key.includes("PRIVATE"))
    return importPrivateKey(key, algorithm, keyUsages);
  return importTextSecret(key, algorithm, keyUsages);
}
__name(importKey, "importKey");
function decodePayload(raw) {
  const bytes = Array.from(atob(raw), (char) => char.charCodeAt(0));
  const decodedString = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  return JSON.parse(decodedString);
}
__name(decodePayload, "decodePayload");
if (typeof crypto === "undefined" || !crypto.subtle)
  throw new Error("SubtleCrypto not supported!");
var algorithms = {
  none: { name: "none" },
  ES256: { name: "ECDSA", namedCurve: "P-256", hash: { name: "SHA-256" } },
  ES384: { name: "ECDSA", namedCurve: "P-384", hash: { name: "SHA-384" } },
  ES512: { name: "ECDSA", namedCurve: "P-521", hash: { name: "SHA-512" } },
  HS256: { name: "HMAC", hash: { name: "SHA-256" } },
  HS384: { name: "HMAC", hash: { name: "SHA-384" } },
  HS512: { name: "HMAC", hash: { name: "SHA-512" } },
  RS256: { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-256" } },
  RS384: { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-384" } },
  RS512: { name: "RSASSA-PKCS1-v1_5", hash: { name: "SHA-512" } }
};
async function sign(payload, secret, options = "HS256") {
  if (typeof options === "string")
    options = { algorithm: options };
  options = { algorithm: "HS256", header: { typ: "JWT", ...options.header ?? {} }, ...options };
  if (!payload || typeof payload !== "object")
    throw new Error("payload must be an object");
  if (options.algorithm !== "none" && (!secret || typeof secret !== "string" && typeof secret !== "object"))
    throw new Error("secret must be a string, a JWK object or a CryptoKey object");
  if (typeof options.algorithm !== "string")
    throw new Error("options.algorithm must be a string");
  const algorithm = algorithms[options.algorithm];
  if (!algorithm)
    throw new Error("algorithm not found");
  if (!payload.iat)
    payload.iat = Math.floor(Date.now() / 1e3);
  const partialToken = `${textToBase64Url(JSON.stringify({ ...options.header, alg: options.algorithm }))}.${textToBase64Url(JSON.stringify(payload))}`;
  if (options.algorithm === "none")
    return partialToken;
  const key = secret instanceof CryptoKey ? secret : await importKey(secret, algorithm, ["sign"]);
  const signature = await crypto.subtle.sign(algorithm, key, textToUint8Array(partialToken));
  return `${partialToken}.${arrayBufferToBase64Url(signature)}`;
}
__name(sign, "sign");
async function verify(token, secret, options = "HS256") {
  if (typeof options === "string")
    options = { algorithm: options };
  options = { algorithm: "HS256", clockTolerance: 0, throwError: false, ...options };
  if (typeof token !== "string")
    throw new Error("token must be a string");
  if (options.algorithm !== "none" && typeof secret !== "string" && typeof secret !== "object")
    throw new Error("secret must be a string, a JWK object or a CryptoKey object");
  if (typeof options.algorithm !== "string")
    throw new Error("options.algorithm must be a string");
  const tokenParts = token.split(".", 3);
  if (tokenParts.length < 2)
    throw new Error("token must consist of 2 or more parts");
  const [tokenHeader, tokenPayload, tokenSignature] = tokenParts;
  const algorithm = algorithms[options.algorithm];
  if (!algorithm)
    throw new Error("algorithm not found");
  const decodedToken = decode(token);
  try {
    if (decodedToken.header?.alg !== options.algorithm)
      throw new Error("INVALID_SIGNATURE");
    if (decodedToken.payload) {
      const now = Math.floor(Date.now() / 1e3);
      if (decodedToken.payload.nbf && decodedToken.payload.nbf > now && decodedToken.payload.nbf - now > (options.clockTolerance ?? 0))
        throw new Error("NOT_YET_VALID");
      if (decodedToken.payload.exp && decodedToken.payload.exp <= now && now - decodedToken.payload.exp > (options.clockTolerance ?? 0))
        throw new Error("EXPIRED");
    }
    if (algorithm.name === "none")
      return decodedToken;
    const key = secret instanceof CryptoKey ? secret : await importKey(secret, algorithm, ["verify"]);
    if (!await crypto.subtle.verify(algorithm, key, base64UrlToUint8Array(tokenSignature), textToUint8Array(`${tokenHeader}.${tokenPayload}`)))
      throw new Error("INVALID_SIGNATURE");
    return decodedToken;
  } catch (err) {
    if (options.throwError)
      throw err;
    return;
  }
}
__name(verify, "verify");
function decode(token) {
  return {
    header: decodePayload(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")),
    payload: decodePayload(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
  };
}
__name(decode, "decode");
var index_default = {
  sign,
  verify,
  decode
};

// src/log.ts
function logWithContext(context2, message, data) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const logMessage = `[${timestamp}] [${context2}] ${message}`;
  if (data) {
    console.log(logMessage, JSON.stringify(data, null, 2));
  } else {
    console.log(logMessage);
  }
}
__name(logWithContext, "logWithContext");

// src/crypto.ts
async function encrypt(text, key) {
  logWithContext("ENCRYPTION", "Starting encryption process");
  if (!key) {
    logWithContext("ENCRYPTION", "Generating encryption key from static material");
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("github-app-encryption-key-32char"),
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    key = keyMaterial;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedText
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  logWithContext("ENCRYPTION", "Encryption completed successfully");
  return btoa(String.fromCharCode(...combined));
}
__name(encrypt, "encrypt");
async function decrypt(encryptedText, key) {
  logWithContext("DECRYPTION", "Starting decryption process");
  if (!key) {
    logWithContext("DECRYPTION", "Generating decryption key from static material");
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("github-app-encryption-key-32char"),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    key = keyMaterial;
  }
  const combined = new Uint8Array(
    atob(encryptedText).split("").map((char) => char.charCodeAt(0))
  );
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  const result = new TextDecoder().decode(decrypted);
  logWithContext("DECRYPTION", "Decryption completed successfully");
  return result;
}
__name(decrypt, "decrypt");
async function generateAppJWT(appId, privateKey) {
  logWithContext("JWT", "Generating App JWT token", { appId });
  const now = Math.floor(Date.now() / 1e3);
  const payload = {
    iss: appId,
    iat: now - 60,
    // Issue time (1 minute ago to account for clock skew)
    exp: now + 600
    // Expiration time (10 minutes from now)
  };
  logWithContext("JWT", "JWT payload prepared", { payload });
  const token = await index_default.sign(payload, privateKey, { algorithm: "RS256" });
  logWithContext("JWT", "App JWT token generated successfully");
  return token;
}
__name(generateAppJWT, "generateAppJWT");
async function generateInstallationToken(appId, privateKey, installationId) {
  logWithContext("INSTALLATION_TOKEN", "Starting installation token generation", {
    appId,
    installationId
  });
  try {
    const appJWT = await generateAppJWT(appId, privateKey);
    logWithContext("INSTALLATION_TOKEN", "App JWT generated, exchanging for installation token");
    const apiUrl = `https://api.github.com/app/installations/${installationId}/access_tokens`;
    logWithContext("INSTALLATION_TOKEN", "Calling GitHub API", { url: apiUrl });
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${appJWT}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Worker-GitHub-Integration"
      }
    });
    logWithContext("INSTALLATION_TOKEN", "GitHub API response received", {
      status: response.status,
      statusText: response.statusText
    });
    if (!response.ok) {
      const errorText = await response.text();
      logWithContext("INSTALLATION_TOKEN", "Failed to generate installation token", {
        status: response.status,
        error: errorText
      });
      return null;
    }
    const tokenData = await response.json();
    logWithContext("INSTALLATION_TOKEN", "Installation token generated successfully", {
      expires_at: tokenData.expires_at
    });
    return tokenData;
  } catch (error3) {
    logWithContext("INSTALLATION_TOKEN", "Error generating installation token", {
      error: error3 instanceof Error ? error3.message : String(error3)
    });
    return null;
  }
}
__name(generateInstallationToken, "generateInstallationToken");

// src/fetch.ts
async function containerFetch(container, request, options = {}) {
  const { containerName = "unknown", route = "unknown", timeout = 3e5 } = options;
  const startTime = Date.now();
  logWithContext("CONTAINER_FETCH", `Starting fetch to ${containerName} for route ${route}`, {
    url: request.url,
    method: request.method,
    containerName,
    route
  });
  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Container fetch timeout after ${timeout}ms`)), timeout);
    });
    const response = await Promise.race([
      container.fetch(request),
      timeoutPromise
    ]);
    const duration = Date.now() - startTime;
    logWithContext("CONTAINER_FETCH", `Container fetch completed successfully`, {
      containerName,
      route,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`
    });
    return response;
  } catch (error3) {
    const duration = Date.now() - startTime;
    logWithContext("CONTAINER_FETCH", `Container fetch failed`, {
      containerName,
      route,
      error: error3 instanceof Error ? error3.message : String(error3),
      duration: `${duration}ms`
    });
    return new Response(
      JSON.stringify({
        error: `Container fetch failed`,
        message: error3 instanceof Error ? error3.message : String(error3),
        containerName,
        route
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
__name(containerFetch, "containerFetch");
function getRouteFromRequest(request) {
  try {
    const url = new URL(request.url);
    return url.pathname;
  } catch {
    return "unknown";
  }
}
__name(getRouteFromRequest, "getRouteFromRequest");

// src/handlers/oauth_callback.ts
async function handleOAuthCallback(_request, url, env2) {
  logWithContext("OAUTH_CALLBACK", "Handling OAuth callback", {
    hasCode: !!url.searchParams.get("code"),
    origin: url.origin
  });
  const code = url.searchParams.get("code");
  if (!code) {
    logWithContext("OAUTH_CALLBACK", "Missing authorization code in callback");
    return new Response("Missing authorization code", { status: 400 });
  }
  try {
    logWithContext("OAUTH_CALLBACK", "Exchanging code for app credentials", { code: code.substring(0, 8) + "..." });
    const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Worker-GitHub-Integration"
      }
    });
    logWithContext("OAUTH_CALLBACK", "GitHub manifest conversion response", {
      status: response.status,
      statusText: response.statusText
    });
    if (!response.ok) {
      const errorText = await response.text();
      logWithContext("OAUTH_CALLBACK", "GitHub API error", {
        status: response.status,
        error: errorText
      });
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const appData = await response.json();
    logWithContext("OAUTH_CALLBACK", "App credentials received", {
      appId: appData.id,
      appName: appData.name,
      owner: appData.owner?.login
    });
    logWithContext("OAUTH_CALLBACK", "Storing app credentials in Durable Object");
    try {
      const encryptedPrivateKey = await encrypt(appData.pem);
      const encryptedWebhookSecret = await encrypt(appData.webhook_secret);
      logWithContext("OAUTH_CALLBACK", "App credentials encrypted successfully");
      const appConfig = {
        appId: appData.id.toString(),
        privateKey: encryptedPrivateKey,
        webhookSecret: encryptedWebhookSecret,
        repositories: [],
        owner: {
          login: appData.owner?.login || "unknown",
          type: "User",
          // Default to User, will be updated during installation
          id: 0
          // Will be updated during installation
        },
        permissions: {
          contents: "read",
          metadata: "read",
          pull_requests: "write",
          issues: "write"
        },
        events: ["issues"],
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        webhookCount: 0
      };
      const id = env2.GITHUB_APP_CONFIG.idFromName(appData.id.toString());
      const configDO = env2.GITHUB_APP_CONFIG.get(id);
      const storeResponse = await configDO.fetch(new Request("http://internal/store", {
        method: "POST",
        body: JSON.stringify(appConfig)
      }));
      logWithContext("OAUTH_CALLBACK", "App config stored in Durable Object", {
        appId: appData.id,
        storeResponseStatus: storeResponse.status
      });
    } catch (error3) {
      logWithContext("OAUTH_CALLBACK", "Failed to store app config", {
        error: error3 instanceof Error ? error3.message : String(error3)
      });
    }
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>GitHub App Created Successfully</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
        }
        .success { color: #28a745; }
        .install-btn {
            display: inline-block;
            background: #0969da;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }
        .app-info {
            background: #f5f5f5;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }
    </style>
</head>
<body>
    <h1 class="success">GitHub App Created Successfully!</h1>

    <div class="app-info">
        <h3>App Details</h3>
        <p><strong>Name:</strong> ${appData.name}</p>
        <p><strong>App ID:</strong> ${appData.id}</p>
        <p><strong>Owner:</strong> ${appData.owner?.login || "Unknown"}</p>
    </div>

    <p>Your GitHub App has been created with all necessary permissions and webhook configuration.</p>

    <h3>Next Step: Install Your App</h3>
    <p>Click the button below to install the app on your repositories and start receiving webhooks.</p>

    <a href="${appData.html_url}/installations/new" class="install-btn">
        Install App on Repositories
    </a>

    <p><small>App credentials have been securely stored and webhooks are ready to receive events.</small></p>
</body>
</html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html" }
    });
  } catch (error3) {
    logWithContext("OAUTH_CALLBACK", "OAuth callback error", {
      error: error3 instanceof Error ? error3.message : String(error3)
    });
    return new Response(`Setup failed: ${error3.message}`, { status: 500 });
  }
}
__name(handleOAuthCallback, "handleOAuthCallback");

// src/handlers/claude_setup.ts
async function handleClaudeSetup(request, origin, env2) {
  logWithContext("CLAUDE_SETUP", "Handling Claude setup request", {
    method: request.method,
    origin
  });
  if (request.method === "POST") {
    logWithContext("CLAUDE_SETUP", "Processing API key submission");
    try {
      const formData = await request.formData();
      const apiKey = formData.get("anthropic_api_key");
      logWithContext("CLAUDE_SETUP", "API key received", {
        hasApiKey: !!apiKey,
        keyPrefix: apiKey ? apiKey.substring(0, 7) + "..." : "none"
      });
      if (!apiKey || !apiKey.startsWith("sk-ant-")) {
        logWithContext("CLAUDE_SETUP", "Invalid API key format provided");
        throw new Error("Invalid Anthropic API key format");
      }
      const deploymentId = "claude-config";
      logWithContext("CLAUDE_SETUP", "Storing API key in Durable Object", { deploymentId });
      const id = env2.GITHUB_APP_CONFIG.idFromName(deploymentId);
      const configDO = env2.GITHUB_APP_CONFIG.get(id);
      const encryptedApiKey = await encrypt(apiKey);
      logWithContext("CLAUDE_SETUP", "API key encrypted successfully");
      const storeResponse = await configDO.fetch(new Request("http://internal/store-claude-key", {
        method: "POST",
        body: JSON.stringify({
          anthropicApiKey: encryptedApiKey,
          claudeSetupAt: (/* @__PURE__ */ new Date()).toISOString()
        })
      }));
      logWithContext("CLAUDE_SETUP", "API key stored in Durable Object", {
        storeResponseStatus: storeResponse.status
      });
      return new Response(`
<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Setup Complete</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
        }
        .success { color: #28a745; }
        .next-btn {
            display: inline-block;
            background: #0969da;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1 class="success">Claude Code API Key Configured!</h1>
    <p>Your Anthropic API key has been securely stored and encrypted.</p>
    <p>Claude Code is now ready to process GitHub issues automatically!</p>

    <a href="/gh-setup" class="next-btn">
        Setup GitHub Integration
    </a>

    <p><small>Your API key is encrypted and stored securely in Cloudflare's Durable Objects.</small></p>
</body>
</html>`, {
        headers: { "Content-Type": "text/html" }
      });
    } catch (error3) {
      logWithContext("CLAUDE_SETUP", "Error during Claude setup", {
        error: error3 instanceof Error ? error3.message : String(error3)
      });
      return new Response(`
<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Setup Error</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 20px;
            text-align: center;
        }
        .error { color: #dc3545; }
        .back-btn {
            display: inline-block;
            background: #6c757d;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1 class="error">\u274C Setup Error</h1>
    <p>Error: ${error3.message}</p>

    <a href="/claude-setup" class="back-btn">
        \u2190 Try Again
    </a>
</body>
</html>`, {
        headers: { "Content-Type": "text/html" },
        status: 400
      });
    }
  }
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Claude Code Setup - Anthropic API Key</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .setup-form {
            background: #f5f5f5;
            padding: 30px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
            box-sizing: border-box;
        }
        .submit-btn {
            background: #28a745;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            font-size: 14px;
            width: 100%;
        }
        .submit-btn:hover {
            background: #218838;
        }
        .info-box {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 6px;
            border-left: 4px solid #2196f3;
            margin: 20px 0;
        }
        .steps {
            margin: 30px 0;
        }
        .step {
            margin: 15px 0;
            padding-left: 30px;
            position: relative;
        }
        .step-number {
            position: absolute;
            left: 0;
            top: 0;
            background: #0969da;
            color: white;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
        }
        .security-note {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #28a745;
            margin: 20px 0;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Claude Code Setup</h1>
        <p>Configure your Anthropic API key to enable AI-powered GitHub issue processing</p>
    </div>

    <div class="info-box">
        <h3>What you'll need</h3>
        <p>An Anthropic API key with access to Claude. You can get one from the <a href="https://console.anthropic.com/" target="_blank">Anthropic Console</a>.</p>
    </div>

    <div class="steps">
        <h3>Quick Setup Steps</h3>

        <div class="step">
            <div class="step-number">1</div>
            <strong>Get your API Key</strong><br>
            Visit <a href="https://console.anthropic.com/" target="_blank">console.anthropic.com</a> and create an API key (starts with "sk-ant-").
        </div>

        <div class="step">
            <div class="step-number">2</div>
            <strong>Enter API Key</strong><br>
            Paste your API key in the form below. It will be encrypted and stored securely.
        </div>

        <div class="step">
            <div class="step-number">3</div>
            <strong>Setup GitHub Integration</strong><br>
            After saving your key, configure GitHub to send webhooks for automatic issue processing.
        </div>
    </div>

    <form method="POST" class="setup-form">
        <div class="form-group">
            <label for="anthropic_api_key">Anthropic API Key</label>
            <input
                type="password"
                id="anthropic_api_key"
                name="anthropic_api_key"
                placeholder="sk-ant-api03-..."
                required
                pattern="sk-ant-.*"
                title="API key must start with 'sk-ant-'"
            >
        </div>

        <button type="submit" class="submit-btn">
            Save API Key Securely
        </button>
    </form>

    <div class="security-note">
        <strong>Security:</strong> Your API key is encrypted using AES-256-GCM before storage.
        Only your worker deployment can decrypt and use it. It's never logged or exposed.
    </div>

    <p><strong>Already configured?</strong> <a href="/gh-setup">Continue to GitHub Setup</a></p>

    <hr style="margin: 40px 0;">
    <p style="text-align: center;"><a href="/">Back to Home</a></p>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}
__name(handleClaudeSetup, "handleClaudeSetup");

// src/handlers/github_setup.ts
function generateAppManifest(workerDomain) {
  return {
    name: `Claude Code on Cloudflare`,
    url: workerDomain,
    hook_attributes: {
      url: `${workerDomain}/webhooks/github`
    },
    redirect_url: `${workerDomain}/gh-setup/callback`,
    callback_urls: [`${workerDomain}/gh-setup/callback`],
    setup_url: `${workerDomain}`,
    public: false,
    default_permissions: {
      contents: "write",
      metadata: "read",
      pull_requests: "write",
      issues: "write"
    },
    default_events: [
      "issues"
    ]
  };
}
__name(generateAppManifest, "generateAppManifest");
async function handleGitHubSetup(_request, origin) {
  logWithContext("GITHUB_SETUP", "Handling GitHub setup request", { origin });
  const webhookUrl = `${origin}/webhooks/github`;
  const manifest = generateAppManifest(origin);
  const manifestJson = JSON.stringify(manifest);
  logWithContext("GITHUB_SETUP", "Generated GitHub App manifest", {
    webhookUrl,
    appName: manifest.name
  });
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>GitHub App Setup - Cloudflare Worker</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .webhook-info {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .webhook-url {
            font-family: monospace;
            background: #fff;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            word-break: break-all;
        }
        .create-app-btn {
            background: #238636;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            cursor: pointer;
            font-size: 14px;
        }
        .create-app-btn:hover {
            background: #2ea043;
        }
        .steps {
            margin: 30px 0;
        }
        .step {
            margin: 15px 0;
            padding-left: 30px;
            position: relative;
        }
        .step-number {
            position: absolute;
            left: 0;
            top: 0;
            background: #0969da;
            color: white;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>GitHub App Setup</h1>
        <p>Configure GitHub webhook integration for your Cloudflare Worker</p>
    </div>

    <div class="webhook-info">
        <h3>Your Webhook URL</h3>
        <div class="webhook-url">${webhookUrl}</div>
        <p>This URL will receive GitHub webhook events once setup is complete.</p>
    </div>

    <div class="steps">
        <h3>Setup Steps</h3>

        <div class="step">
            <div class="step-number">1</div>
            <strong>Create GitHub App</strong><br>
            Click the button below to create a pre-configured GitHub App with all necessary permissions and webhook settings.
        </div>

        <div class="step">
            <div class="step-number">2</div>
            <strong>Choose Account</strong><br>
            Select which GitHub account or organization should own the app.
        </div>

        <div class="step">
            <div class="step-number">3</div>
            <strong>Install App</strong><br>
            After creation, you'll be guided to install the app on your repositories.
        </div>
    </div>

    <div style="text-align: center; margin: 40px 0;">
        <form action="https://github.com/settings/apps/new" method="post" id="github-app-form">
            <input type="hidden" name="manifest" id="manifest" value="">
            <button type="submit" class="create-app-btn">
                Create GitHub App
            </button>
        </form>
    </div>

    <details>
        <summary>App Configuration Details</summary>
        <pre style="background: #f8f8f8; padding: 15px; border-radius: 4px; overflow-x: auto;">
Permissions:
- Repository contents: read
- Repository metadata: read
- Pull requests: write
- Issues: write

Webhook Events:
- issues
- installation events (automatically enabled)

Webhook URL: ${webhookUrl}
        </pre>
    </details>

    <script>
        // Set the manifest data when the page loads
        document.getElementById('manifest').value = ${JSON.stringify(manifestJson)};
    <\/script>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html" }
  });
}
__name(handleGitHubSetup, "handleGitHubSetup");

// src/handlers/github_status.ts
async function handleGitHubStatus(_request, env2) {
  const url = new URL(_request.url);
  const appId = url.searchParams.get("app_id");
  if (!appId) {
    return new Response(JSON.stringify({ error: "Missing app_id parameter" }), {
      headers: { "Content-Type": "application/json" },
      status: 400
    });
  }
  try {
    const id = env2.GITHUB_APP_CONFIG.idFromName(appId);
    const configDO = env2.GITHUB_APP_CONFIG.get(id);
    const response = await configDO.fetch(new Request("http://internal/get"));
    const config2 = await response.json();
    if (!config2) {
      return new Response(JSON.stringify({ error: "No configuration found for this app ID" }), {
        headers: { "Content-Type": "application/json" },
        status: 404
      });
    }
    const safeConfig = {
      appId: config2.appId,
      owner: config2.owner,
      repositories: config2.repositories,
      permissions: config2.permissions,
      events: config2.events,
      createdAt: config2.createdAt,
      lastWebhookAt: config2.lastWebhookAt,
      webhookCount: config2.webhookCount,
      installationId: config2.installationId,
      hasCredentials: !!(config2.privateKey && config2.webhookSecret)
    };
    return new Response(JSON.stringify(safeConfig, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error3) {
    console.error("Error fetching GitHub status:", error3);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    });
  }
}
__name(handleGitHubStatus, "handleGitHubStatus");

// src/handlers/github_webhooks/installation.ts
async function handleInstallationEvent(data, configDO) {
  const action = data.action;
  const installation = data.installation;
  logWithContext("INSTALLATION_EVENT", "Processing installation event", {
    action,
    installationId: installation?.id,
    account: installation?.account?.login,
    accountType: installation?.account?.type
  });
  if (action === "created") {
    const repositories = data.repositories || [];
    const repoData = repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private
    }));
    logWithContext("INSTALLATION_EVENT", "Updating installation configuration", {
      repositoryCount: repositories.length,
      repositories: repoData.map((r) => r.full_name)
    });
    const updateResponse = await configDO.fetch(new Request("http://internal/update-installation", {
      method: "POST",
      body: JSON.stringify({
        installationId: installation.id.toString(),
        repositories: repoData,
        owner: {
          login: installation.account.login,
          type: installation.account.type,
          id: installation.account.id
        }
      })
    }));
    logWithContext("INSTALLATION_EVENT", "App installed successfully", {
      repositoryCount: repositories.length,
      updateResponseStatus: updateResponse.status
    });
  } else if (action === "deleted") {
    logWithContext("INSTALLATION_EVENT", "App installation removed", {
      installationId: installation?.id
    });
  } else {
    logWithContext("INSTALLATION_EVENT", "Unhandled installation action", { action });
  }
  return new Response("Installation event processed", { status: 200 });
}
__name(handleInstallationEvent, "handleInstallationEvent");

// src/handlers/github_webhooks/installation_change.ts
async function handleInstallationRepositoriesEvent(data, configDO) {
  const action = data.action;
  if (action === "added") {
    const addedRepos = data.repositories_added || [];
    for (const repo of addedRepos) {
      await configDO.fetch(new Request("http://internal/add-repository", {
        method: "POST",
        body: JSON.stringify({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private
        })
      }));
    }
    console.log(`Added ${addedRepos.length} repositories`);
  } else if (action === "removed") {
    const removedRepos = data.repositories_removed || [];
    for (const repo of removedRepos) {
      await configDO.fetch(new Request(`http://internal/remove-repository/${repo.id}`, {
        method: "DELETE"
      }));
    }
    console.log(`Removed ${removedRepos.length} repositories`);
  }
  return new Response("Repository changes processed", { status: 200 });
}
__name(handleInstallationRepositoriesEvent, "handleInstallationRepositoriesEvent");

// src/github_client.ts
var GitHubAPI = class {
  static {
    __name(this, "GitHubAPI");
  }
  constructor(configDO) {
    this.configDO = configDO;
  }
  async makeAuthenticatedRequest(path, options = {}) {
    logWithContext("GITHUB_API", "Making authenticated request", { path, method: options.method || "GET" });
    const tokenResponse = await this.configDO.fetch(new Request("http://internal/get-installation-token"));
    const tokenData = await tokenResponse.json();
    if (!tokenData.token) {
      logWithContext("GITHUB_API", "No installation token available");
      throw new Error("No valid installation token available");
    }
    const headers = {
      "Authorization": `Bearer ${tokenData.token}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Worker-GitHub-Integration",
      ...options.headers
    };
    const url = `https://api.github.com${path}`;
    logWithContext("GITHUB_API", "Sending request to GitHub", { url, headers: Object.keys(headers) });
    const response = await fetch(url, {
      ...options,
      headers
    });
    logWithContext("GITHUB_API", "GitHub API response", {
      status: response.status,
      statusText: response.statusText,
      path
    });
    return response;
  }
  // Get repository information
  async getRepository(owner, repo) {
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}`);
    return response.json();
  }
  // Comment on an issue or pull request
  async createComment(owner, repo, issueNumber, body) {
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
    return response.json();
  }
  // Get installation repositories
  async getInstallationRepositories() {
    const response = await this.makeAuthenticatedRequest("/installation/repositories");
    return response.json();
  }
  // Branch Operations
  async createBranch(owner, repo, branchName, baseSha) {
    logWithContext("GITHUB_API", "Creating branch", { owner, repo, branchName, baseSha });
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha
      })
    });
    if (!response.ok) {
      const error3 = await response.text();
      logWithContext("GITHUB_API", "Failed to create branch", { status: response.status, error: error3 });
      throw new Error(`Failed to create branch: ${response.status} ${error3}`);
    }
  }
  // Get default branch SHA
  async getDefaultBranchSha(owner, repo) {
    logWithContext("GITHUB_API", "Getting default branch SHA", { owner, repo });
    const repoResponse = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}`);
    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch;
    const branchResponse = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}/branches/${defaultBranch}`);
    const branchData = await branchResponse.json();
    return branchData.commit.sha;
  }
  // PR Operations
  async createPullRequest(owner, repo, title2, body, head, base) {
    logWithContext("GITHUB_API", "Creating pull request", { owner, repo, title: title2, head, base });
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: title2,
        body,
        head,
        base
      })
    });
    if (!response.ok) {
      const error3 = await response.text();
      logWithContext("GITHUB_API", "Failed to create pull request", { status: response.status, error: error3 });
      throw new Error(`Failed to create pull request: ${response.status} ${error3}`);
    }
    return response.json();
  }
  // Update file content
  async updateFile(owner, repo, path, content, message, branch, sha) {
    logWithContext("GITHUB_API", "Updating file", { owner, repo, path, branch });
    const body = {
      message,
      content: btoa(content),
      // Base64 encode content
      branch
    };
    if (sha) {
      body.sha = sha;
    }
    const response = await this.makeAuthenticatedRequest(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error3 = await response.text();
      logWithContext("GITHUB_API", "Failed to update file", { status: response.status, error: error3 });
      throw new Error(`Failed to update file: ${response.status} ${error3}`);
    }
    return response.json();
  }
  // Get file content
  async getFileContent(owner, repo, path, ref) {
    logWithContext("GITHUB_API", "Getting file content", { owner, repo, path, ref });
    const url = `/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`;
    const response = await this.makeAuthenticatedRequest(url);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const error3 = await response.text();
      logWithContext("GITHUB_API", "Failed to get file content", { status: response.status, error: error3 });
      throw new Error(`Failed to get file content: ${response.status} ${error3}`);
    }
    const data = await response.json();
    return {
      content: atob(data.content),
      // Base64 decode content
      sha: data.sha
    };
  }
};

// src/handlers/github_webhooks/issue.ts
async function routeToClaudeCodeContainer(issue, repository, env2, configDO) {
  const containerName = `claude-issue-${issue.id}`;
  logWithContext("CLAUDE_ROUTING", "Routing issue to Claude Code container", {
    issueNumber: issue.number,
    issueId: issue.id,
    containerName,
    repository: repository.full_name
  });
  const id = env2.MY_CONTAINER.idFromName(containerName);
  const container = env2.MY_CONTAINER.get(id);
  logWithContext("CLAUDE_ROUTING", "Retrieving installation token");
  const tokenResponse = await configDO.fetch(new Request("http://internal/get-installation-token"));
  const tokenData = await tokenResponse.json();
  logWithContext("CLAUDE_ROUTING", "Installation token retrieved", {
    hasToken: !!tokenData.token
  });
  logWithContext("CLAUDE_ROUTING", "Retrieving Claude API key");
  const claudeConfigId = env2.GITHUB_APP_CONFIG.idFromName("claude-config");
  const claudeConfigDO = env2.GITHUB_APP_CONFIG.get(claudeConfigId);
  const claudeKeyResponse = await claudeConfigDO.fetch(new Request("http://internal/get-claude-key"));
  const claudeKeyData = await claudeKeyResponse.json();
  logWithContext("CLAUDE_ROUTING", "Claude API key check", {
    hasApiKey: !!claudeKeyData.anthropicApiKey
  });
  if (!claudeKeyData.anthropicApiKey) {
    logWithContext("CLAUDE_ROUTING", "Claude API key not configured");
    throw new Error("Claude API key not configured. Please visit /claude-setup first.");
  }
  const issueContext = {
    ANTHROPIC_API_KEY: claudeKeyData.anthropicApiKey,
    GITHUB_TOKEN: tokenData.token,
    ISSUE_ID: issue.id.toString(),
    ISSUE_NUMBER: issue.number.toString(),
    ISSUE_TITLE: issue.title,
    ISSUE_BODY: issue.body || "",
    ISSUE_LABELS: JSON.stringify(issue.labels?.map((label) => label.name) || []),
    REPOSITORY_URL: repository.clone_url,
    REPOSITORY_NAME: repository.full_name,
    ISSUE_AUTHOR: issue.user.login,
    MESSAGE: `Processing issue #${issue.number}: ${issue.title}`
  };
  logWithContext("CLAUDE_ROUTING", "Starting Claude Code container processing", {
    containerName,
    issueId: issueContext.ISSUE_ID
  });
  try {
    const response = await containerFetch(container, new Request("http://internal/process-issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(issueContext)
    }), {
      containerName,
      route: "/process-issue"
    });
    logWithContext("CLAUDE_ROUTING", "Claude Code container response", {
      status: response.status,
      statusText: response.statusText
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unable to read error response");
      logWithContext("CLAUDE_ROUTING", "Container returned error", {
        status: response.status,
        errorText
      });
      throw new Error(`Container returned status ${response.status}: ${errorText}`);
    }
    const containerResponse = await response.json();
    logWithContext("CLAUDE_ROUTING", "Container response parsed", {
      success: containerResponse.success,
      message: containerResponse.message,
      hasError: !!containerResponse.error
    });
    if (containerResponse.success) {
      logWithContext("CLAUDE_ROUTING", "Container processing completed successfully", {
        message: containerResponse.message
      });
    } else {
      logWithContext("CLAUDE_ROUTING", "Container processing failed", {
        error: containerResponse.error
      });
    }
  } catch (error3) {
    logWithContext("CLAUDE_ROUTING", "Failed to process Claude Code response", {
      error: error3 instanceof Error ? error3.message : String(error3),
      stack: error3 instanceof Error ? error3.stack : void 0
    });
    throw error3;
  }
}
__name(routeToClaudeCodeContainer, "routeToClaudeCodeContainer");
async function handleIssuesEvent(data, env2, configDO) {
  const action = data.action;
  const issue = data.issue;
  const repository = data.repository;
  logWithContext("ISSUES_EVENT", "Processing issue event", {
    action,
    issueNumber: issue.number,
    issueTitle: issue.title,
    repository: repository.full_name,
    author: issue.user?.login,
    labels: issue.labels?.map((label) => label.name) || []
  });
  const githubAPI = new GitHubAPI(configDO);
  if (action === "opened") {
    logWithContext("ISSUES_EVENT", "Handling new issue creation");
    try {
      logWithContext("ISSUES_EVENT", "Posting initial acknowledgment comment");
      await githubAPI.createComment(
        repository.owner.login,
        repository.name,
        issue.number,
        `\u{1F916} **Claude Code Assistant**

I've received this issue and I'm analyzing it now. I'll start working on a solution shortly!

---
\u{1F680} Powered by Claude Code`
      );
      logWithContext("ISSUES_EVENT", "Initial comment posted successfully");
      logWithContext("ISSUES_EVENT", "Routing to Claude Code container");
      await routeToClaudeCodeContainer(issue, repository, env2, configDO);
      logWithContext("ISSUES_EVENT", "Issue routed to Claude Code container successfully");
    } catch (error3) {
      logWithContext("ISSUES_EVENT", "Failed to process new issue", {
        error: error3 instanceof Error ? error3.message : String(error3),
        issueNumber: issue.number
      });
      try {
        logWithContext("ISSUES_EVENT", "Posting error comment to issue");
        await githubAPI.createComment(
          repository.owner.login,
          repository.name,
          issue.number,
          `\u274C I encountered an error while setting up to work on this issue: ${error3.message}

I'll need human assistance to resolve this.`
        );
        logWithContext("ISSUES_EVENT", "Error comment posted successfully");
      } catch (commentError) {
        logWithContext("ISSUES_EVENT", "Failed to post error comment", {
          commentError: commentError instanceof Error ? commentError.message : String(commentError)
        });
      }
    }
  }
  const containerName = `repo-${repository.id}`;
  const id = env2.MY_CONTAINER.idFromName(containerName);
  const container = env2.MY_CONTAINER.get(id);
  const webhookPayload = {
    event: "issues",
    action,
    repository: repository.full_name,
    issue_number: issue.number,
    issue_title: issue.title,
    issue_author: issue.user.login
  };
  await containerFetch(container, new Request("http://internal/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(webhookPayload)
  }), {
    containerName,
    route: "/webhook"
  });
  return new Response("Issues event processed", { status: 200 });
}
__name(handleIssuesEvent, "handleIssuesEvent");

// src/handlers/github_webhook.ts
async function routeWebhookEvent(event, data, configDO, env2) {
  logWithContext("EVENT_ROUTER", "Routing webhook event", {
    event,
    action: data.action,
    repository: data.repository?.full_name
  });
  switch (event) {
    case "installation":
      return handleInstallationEvent(data, configDO);
    case "installation_repositories":
      return handleInstallationRepositoriesEvent(data, configDO);
    case "issues":
      return handleIssuesEvent(data, env2, configDO);
    default:
      logWithContext("EVENT_ROUTER", "Unhandled webhook event", {
        event,
        availableEvents: ["installation", "installation_repositories", "issues"]
      });
      return new Response("Event acknowledged", { status: 200 });
  }
}
__name(routeWebhookEvent, "routeWebhookEvent");
async function verifyGitHubSignature(payload, signature, secret) {
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }
  const sigHex = signature.replace("sha256=", "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const messageBuffer = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.sign("HMAC", key, messageBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  const computedHex = Array.from(hashArray).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return sigHex === computedHex;
}
__name(verifyGitHubSignature, "verifyGitHubSignature");
async function handleGitHubWebhook(request, env2) {
  const startTime = Date.now();
  try {
    const payload = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    const event = request.headers.get("x-github-event");
    const delivery = request.headers.get("x-github-delivery");
    logWithContext("WEBHOOK", "Received GitHub webhook", {
      event,
      delivery,
      hasSignature: !!signature,
      payloadSize: payload.length,
      headers: {
        userAgent: request.headers.get("user-agent"),
        contentType: request.headers.get("content-type")
      }
    });
    if (!signature || !event || !delivery) {
      logWithContext("WEBHOOK", "Missing required webhook headers", {
        hasSignature: !!signature,
        hasEvent: !!event,
        hasDelivery: !!delivery
      });
      return new Response("Missing required headers", { status: 400 });
    }
    let webhookData;
    try {
      webhookData = JSON.parse(payload);
      logWithContext("WEBHOOK", "Webhook payload parsed successfully", {
        hasInstallation: !!webhookData.installation,
        hasRepository: !!webhookData.repository,
        action: webhookData.action
      });
    } catch (error3) {
      logWithContext("WEBHOOK", "Invalid JSON payload", {
        error: error3 instanceof Error ? error3.message : String(error3),
        payloadPreview: payload.substring(0, 200)
      });
      return new Response("Invalid JSON payload", { status: 400 });
    }
    if (event === "ping") {
      logWithContext("WEBHOOK", "Received ping webhook", {
        zen: webhookData.zen,
        hookId: webhookData.hook_id
      });
      return new Response(JSON.stringify({
        message: "Webhook endpoint is active",
        zen: webhookData.zen
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    let appId;
    if (webhookData.installation?.app_id) {
      appId = webhookData.installation.app_id.toString();
      logWithContext("WEBHOOK", "App ID found in installation data", { appId });
    } else if (webhookData.installation?.id) {
      const hookInstallationTargetId = request.headers.get("x-github-hook-installation-target-id");
      if (hookInstallationTargetId) {
        appId = hookInstallationTargetId;
        logWithContext("WEBHOOK", "App ID found in header", { appId });
      } else {
        logWithContext("WEBHOOK", "Cannot determine app ID from webhook payload or headers", {
          hasInstallationId: !!webhookData.installation?.id,
          installationId: webhookData.installation?.id
        });
        return new Response("Cannot determine app ID", { status: 400 });
      }
    } else {
      const hookInstallationTargetId = request.headers.get("x-github-hook-installation-target-id");
      if (hookInstallationTargetId) {
        appId = hookInstallationTargetId;
        logWithContext("WEBHOOK", "App ID found in header (fallback)", { appId });
      } else {
        logWithContext("WEBHOOK", "No installation information in webhook payload", {
          webhookKeys: Object.keys(webhookData),
          event,
          availableHeaders: {
            hookInstallationTargetId: request.headers.get("x-github-hook-installation-target-id"),
            hookInstallationTargetType: request.headers.get("x-github-hook-installation-target-type")
          }
        });
        return new Response(`No installation information for event: ${event}`, { status: 400 });
      }
    }
    logWithContext("WEBHOOK", "Retrieving app configuration", { appId });
    const id = env2.GITHUB_APP_CONFIG.idFromName(appId);
    const configDO = env2.GITHUB_APP_CONFIG.get(id);
    const configResponse = await configDO.fetch(new Request("http://internal/get-credentials"));
    logWithContext("WEBHOOK", "Config DO response", {
      status: configResponse.status,
      appId
    });
    if (!configResponse.ok) {
      logWithContext("WEBHOOK", "No app configuration found", { appId });
      return new Response("App not configured", { status: 404 });
    }
    const credentials = await configResponse.json();
    if (!credentials || !credentials.webhookSecret) {
      logWithContext("WEBHOOK", "No webhook secret found", {
        appId,
        hasCredentials: !!credentials,
        credentialKeys: credentials ? Object.keys(credentials) : []
      });
      return new Response("Webhook secret not found", { status: 500 });
    }
    logWithContext("WEBHOOK", "Webhook secret retrieved successfully");
    logWithContext("WEBHOOK", "Verifying webhook signature");
    const isValid = await verifyGitHubSignature(payload, signature, credentials.webhookSecret);
    logWithContext("WEBHOOK", "Signature verification result", { isValid });
    if (!isValid) {
      logWithContext("WEBHOOK", "Invalid webhook signature", {
        signaturePrefix: signature.substring(0, 15) + "...",
        delivery
      });
      return new Response("Invalid signature", { status: 401 });
    }
    await configDO.fetch(new Request("http://internal/log-webhook", {
      method: "POST",
      body: JSON.stringify({ event, delivery, timestamp: (/* @__PURE__ */ new Date()).toISOString() })
    }));
    logWithContext("WEBHOOK", "Routing to event handler", { event });
    const eventResponse = await routeWebhookEvent(event, webhookData, configDO, env2);
    const processingTime = Date.now() - startTime;
    logWithContext("WEBHOOK", "Webhook processing completed", {
      event,
      delivery,
      processingTimeMs: processingTime,
      responseStatus: eventResponse.status
    });
    return eventResponse;
  } catch (error3) {
    const processingTime = Date.now() - startTime;
    logWithContext("WEBHOOK", "Webhook processing error", {
      error: error3 instanceof Error ? error3.message : String(error3),
      stack: error3 instanceof Error ? error3.stack : void 0,
      processingTimeMs: processingTime
    });
    return new Response("Internal server error", { status: 500 });
  }
}
__name(handleGitHubWebhook, "handleGitHubWebhook");

// src/index.ts
var GitHubAppConfigDO = class {
  static {
    __name(this, "GitHubAppConfigDO");
  }
  constructor(state) {
    this.storage = state.storage;
    this.initializeTables();
    logWithContext("DURABLE_OBJECT", "GitHubAppConfigDO initialized with SQLite");
  }
  initializeTables() {
    logWithContext("DURABLE_OBJECT", "Initializing SQLite tables");
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS github_app_config (
        id INTEGER PRIMARY KEY,
        app_id TEXT NOT NULL,
        private_key TEXT NOT NULL,
        webhook_secret TEXT NOT NULL,
        installation_id TEXT,
        owner_login TEXT NOT NULL,
        owner_type TEXT NOT NULL,
        owner_id INTEGER NOT NULL,
        permissions TEXT NOT NULL,
        events TEXT NOT NULL,
        repositories TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_webhook_at TEXT,
        webhook_count INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `);
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS installation_tokens (
        id INTEGER PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS claude_config (
        id INTEGER PRIMARY KEY,
        anthropic_api_key TEXT NOT NULL,
        claude_setup_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    logWithContext("DURABLE_OBJECT", "SQLite tables initialized successfully");
  }
  async fetch(request) {
    const url = new URL(request.url);
    logWithContext("DURABLE_OBJECT", "Processing request", {
      method: request.method,
      pathname: url.pathname
    });
    if (url.pathname === "/store" && request.method === "POST") {
      logWithContext("DURABLE_OBJECT", "Storing app config");
      const config2 = await request.json();
      logWithContext("DURABLE_OBJECT", "App config received", {
        appId: config2.appId,
        repositoryCount: config2.repositories.length,
        owner: config2.owner.login
      });
      await this.storeAppConfig(config2);
      logWithContext("DURABLE_OBJECT", "App config stored successfully");
      return new Response("OK");
    }
    if (url.pathname === "/get" && request.method === "GET") {
      logWithContext("DURABLE_OBJECT", "Retrieving app config");
      const config2 = await this.getAppConfig();
      logWithContext("DURABLE_OBJECT", "App config retrieved", {
        hasConfig: !!config2,
        appId: config2?.appId,
        repositoryCount: config2?.repositories.length
      });
      return new Response(JSON.stringify(config2));
    }
    if (url.pathname === "/get-credentials" && request.method === "GET") {
      logWithContext("DURABLE_OBJECT", "Retrieving and decrypting credentials");
      const credentials = await this.getDecryptedCredentials();
      logWithContext("DURABLE_OBJECT", "Credentials retrieved", {
        hasPrivateKey: !!credentials?.privateKey,
        hasWebhookSecret: !!credentials?.webhookSecret
      });
      return new Response(JSON.stringify(credentials));
    }
    if (url.pathname === "/log-webhook" && request.method === "POST") {
      const webhookData = await request.json();
      logWithContext("DURABLE_OBJECT", "Logging webhook event", {
        event: webhookData.event,
        delivery: webhookData.delivery
      });
      await this.logWebhook(webhookData.event);
      return new Response("OK");
    }
    if (url.pathname === "/update-installation" && request.method === "POST") {
      const installationData = await request.json();
      logWithContext("DURABLE_OBJECT", "Updating installation", {
        installationId: installationData.installationId,
        repositoryCount: installationData.repositories.length,
        owner: installationData.owner.login
      });
      await this.updateInstallation(installationData.installationId, installationData.repositories);
      const config2 = await this.getAppConfig();
      if (config2) {
        config2.owner = installationData.owner;
        await this.storeAppConfig(config2);
        logWithContext("DURABLE_OBJECT", "Installation updated successfully");
      }
      return new Response("OK");
    }
    if (url.pathname === "/add-repository" && request.method === "POST") {
      const repo = await request.json();
      await this.addRepository(repo);
      return new Response("OK");
    }
    if (url.pathname.startsWith("/remove-repository/") && request.method === "DELETE") {
      const repoId = parseInt(url.pathname.split("/").pop() || "0");
      await this.removeRepository(repoId);
      return new Response("OK");
    }
    if (url.pathname === "/get-installation-token" && request.method === "GET") {
      logWithContext("DURABLE_OBJECT", "Generating installation token");
      const token = await this.getInstallationToken();
      logWithContext("DURABLE_OBJECT", "Installation token generated", {
        hasToken: !!token
      });
      return new Response(JSON.stringify({ token }));
    }
    if (url.pathname === "/store-claude-key" && request.method === "POST") {
      logWithContext("DURABLE_OBJECT", "Storing Claude API key");
      const claudeData = await request.json();
      await this.storeClaudeApiKey(claudeData.anthropicApiKey, claudeData.claudeSetupAt);
      logWithContext("DURABLE_OBJECT", "Claude API key stored successfully");
      return new Response("OK");
    }
    if (url.pathname === "/get-claude-key" && request.method === "GET") {
      logWithContext("DURABLE_OBJECT", "Retrieving Claude API key");
      const apiKey = await this.getDecryptedClaudeApiKey();
      logWithContext("DURABLE_OBJECT", "Claude API key retrieved", {
        hasApiKey: !!apiKey
      });
      return new Response(JSON.stringify({ anthropicApiKey: apiKey }));
    }
    logWithContext("DURABLE_OBJECT", "Unknown endpoint requested", {
      method: request.method,
      pathname: url.pathname
    });
    return new Response("Not Found", { status: 404 });
  }
  async storeAppConfig(config2) {
    await this.storeAppConfigSQLite(config2);
  }
  async storeAppConfigSQLite(config2) {
    logWithContext("DURABLE_OBJECT", "Writing app config to SQLite storage", {
      appId: config2.appId,
      dataSize: JSON.stringify(config2).length
    });
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.storage.sql.exec(
      `INSERT OR REPLACE INTO github_app_config (
        id, app_id, private_key, webhook_secret, installation_id,
        owner_login, owner_type, owner_id, permissions, events,
        repositories, created_at, last_webhook_at, webhook_count, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      config2.appId,
      config2.privateKey,
      config2.webhookSecret,
      config2.installationId || null,
      config2.owner.login,
      config2.owner.type,
      config2.owner.id,
      JSON.stringify(config2.permissions),
      JSON.stringify(config2.events),
      JSON.stringify(config2.repositories),
      config2.createdAt,
      config2.lastWebhookAt || null,
      config2.webhookCount || 0,
      now
    );
    logWithContext("DURABLE_OBJECT", "App config stored successfully in SQLite");
  }
  async getAppConfig() {
    logWithContext("DURABLE_OBJECT", "Reading app config from SQLite storage");
    const cursor = this.storage.sql.exec("SELECT * FROM github_app_config WHERE id = 1 LIMIT 1");
    const results = cursor.toArray();
    if (results.length === 0) {
      logWithContext("DURABLE_OBJECT", "No app config found in SQLite storage");
      return null;
    }
    const row = results[0];
    const config2 = {
      appId: row.app_id,
      privateKey: row.private_key,
      webhookSecret: row.webhook_secret,
      installationId: row.installation_id || void 0,
      owner: {
        login: row.owner_login,
        type: row.owner_type,
        id: row.owner_id
      },
      permissions: JSON.parse(row.permissions),
      events: JSON.parse(row.events),
      repositories: JSON.parse(row.repositories),
      createdAt: row.created_at,
      lastWebhookAt: row.last_webhook_at || void 0,
      webhookCount: row.webhook_count || 0
    };
    logWithContext("DURABLE_OBJECT", "App config retrieved from SQLite storage", {
      hasConfig: true,
      appId: config2.appId,
      repositoryCount: config2.repositories.length
    });
    return config2;
  }
  async updateInstallation(installationId, repositories) {
    const config2 = await this.getAppConfig();
    if (config2) {
      config2.installationId = installationId;
      config2.repositories = repositories;
      await this.storeAppConfig(config2);
    }
  }
  async logWebhook(_event) {
    const config2 = await this.getAppConfig();
    if (config2) {
      config2.lastWebhookAt = (/* @__PURE__ */ new Date()).toISOString();
      config2.webhookCount = (config2.webhookCount || 0) + 1;
      await this.storeAppConfig(config2);
    }
  }
  async addRepository(repo) {
    const config2 = await this.getAppConfig();
    if (config2) {
      const exists = config2.repositories.some((r) => r.id === repo.id);
      if (!exists) {
        config2.repositories.push(repo);
        await this.storeAppConfig(config2);
      }
    }
  }
  async removeRepository(repoId) {
    const config2 = await this.getAppConfig();
    if (config2) {
      config2.repositories = config2.repositories.filter((r) => r.id !== repoId);
      await this.storeAppConfig(config2);
    }
  }
  async getDecryptedCredentials() {
    const config2 = await this.getAppConfig();
    if (!config2) {
      logWithContext("DURABLE_OBJECT", "Cannot decrypt credentials - no config found");
      return null;
    }
    try {
      logWithContext("DURABLE_OBJECT", "Decrypting credentials");
      const privateKey = await decrypt(config2.privateKey);
      const webhookSecret = await decrypt(config2.webhookSecret);
      logWithContext("DURABLE_OBJECT", "Credentials decrypted successfully");
      return { privateKey, webhookSecret };
    } catch (error3) {
      logWithContext("DURABLE_OBJECT", "Failed to decrypt credentials", {
        error: error3 instanceof Error ? error3.message : String(error3)
      });
      return null;
    }
  }
  async getInstallationToken() {
    const config2 = await this.getAppConfig();
    if (!config2 || !config2.installationId) {
      logWithContext("DURABLE_OBJECT", "Cannot generate token - missing config or installation ID", {
        hasConfig: !!config2,
        hasInstallationId: !!config2?.installationId
      });
      return null;
    }
    try {
      const cachedToken = await this.getCachedInstallationToken();
      if (cachedToken) {
        const expiresAt = new Date(cachedToken.expires_at);
        const now = /* @__PURE__ */ new Date();
        const timeUntilExpiry = expiresAt.getTime() - now.getTime();
        logWithContext("DURABLE_OBJECT", "Checking cached token from SQLite", {
          expiresAt: cachedToken.expires_at,
          timeUntilExpiryMs: timeUntilExpiry
        });
        if (timeUntilExpiry > 5 * 60 * 1e3) {
          logWithContext("DURABLE_OBJECT", "Using cached installation token from SQLite");
          return cachedToken.token;
        } else {
          logWithContext("DURABLE_OBJECT", "Cached token expired or expiring soon");
        }
      } else {
        logWithContext("DURABLE_OBJECT", "No cached token found in SQLite");
      }
      logWithContext("DURABLE_OBJECT", "Generating new installation token");
      const credentials = await this.getDecryptedCredentials();
      if (!credentials) {
        logWithContext("DURABLE_OBJECT", "Cannot generate token - missing credentials");
        return null;
      }
      const tokenData = await generateInstallationToken(
        config2.appId,
        credentials.privateKey,
        config2.installationId
      );
      if (tokenData) {
        logWithContext("DURABLE_OBJECT", "Caching new installation token in SQLite", {
          expiresAt: tokenData.expires_at
        });
        await this.storeInstallationTokenSQLite(tokenData.token, tokenData.expires_at);
        return tokenData.token;
      }
      logWithContext("DURABLE_OBJECT", "Failed to generate installation token");
      return null;
    } catch (error3) {
      logWithContext("DURABLE_OBJECT", "Error generating installation token", {
        error: error3 instanceof Error ? error3.message : String(error3)
      });
      return null;
    }
  }
  async getCachedInstallationToken() {
    const cursor = this.storage.sql.exec("SELECT * FROM installation_tokens ORDER BY created_at DESC LIMIT 1");
    const results = cursor.toArray();
    if (results.length === 0) {
      return null;
    }
    const row = results[0];
    return {
      token: row.token,
      expires_at: row.expires_at
    };
  }
  async storeInstallationTokenSQLite(token, expiresAt) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.storage.sql.exec("DELETE FROM installation_tokens WHERE expires_at < ?", now);
    this.storage.sql.exec(
      "INSERT INTO installation_tokens (token, expires_at, created_at) VALUES (?, ?, ?)",
      token,
      expiresAt,
      now
    );
  }
  // Claude Code API key management
  async storeClaudeApiKey(encryptedApiKey, setupTimestamp) {
    await this.storeClaudeApiKeySQLite(encryptedApiKey, setupTimestamp);
  }
  async storeClaudeApiKeySQLite(encryptedApiKey, setupTimestamp) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.storage.sql.exec(
      `INSERT OR REPLACE INTO claude_config (
        id, anthropic_api_key, claude_setup_at, created_at, updated_at
      ) VALUES (1, ?, ?, ?, ?)`,
      encryptedApiKey,
      setupTimestamp,
      now,
      now
    );
  }
  async getDecryptedClaudeApiKey() {
    try {
      const cursor = this.storage.sql.exec("SELECT * FROM claude_config WHERE id = 1 LIMIT 1");
      const results = cursor.toArray();
      if (results.length === 0) {
        logWithContext("DURABLE_OBJECT", "No Claude config found in SQLite storage");
        return null;
      }
      const row = results[0];
      logWithContext("DURABLE_OBJECT", "Decrypting Claude API key from SQLite", {
        setupAt: row.claude_setup_at
      });
      const decryptedKey = await decrypt(row.anthropic_api_key);
      logWithContext("DURABLE_OBJECT", "Claude API key decrypted successfully");
      return decryptedKey;
    } catch (error3) {
      logWithContext("DURABLE_OBJECT", "Failed to decrypt Claude API key from SQLite", {
        error: error3 instanceof Error ? error3.message : String(error3)
      });
      return null;
    }
  }
  // SQLite-specific enhancement methods
  async getWebhookStats() {
    const cursor = this.storage.sql.exec(`
      SELECT webhook_count, last_webhook_at
      FROM github_app_config
      WHERE id = 1
      LIMIT 1
    `);
    const results = cursor.toArray();
    if (results.length === 0) {
      return { totalWebhooks: 0, lastWebhookAt: null };
    }
    const row = results[0];
    return {
      totalWebhooks: row.webhook_count || 0,
      lastWebhookAt: row.last_webhook_at || null
    };
  }
  async cleanupExpiredTokens() {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const cursor = this.storage.sql.exec(
      "DELETE FROM installation_tokens WHERE expires_at < ?",
      now
    );
    const deletedCount = cursor.rowsWritten || 0;
    logWithContext("DURABLE_OBJECT", "Cleaned up expired tokens", {
      deletedCount,
      timestamp: now
    });
    return deletedCount;
  }
  async getAllRepositories() {
    const config2 = await this.getAppConfig();
    return config2?.repositories || [];
  }
  async getInstallationStats() {
    const config2 = await this.getAppConfig();
    const claudeCursor = this.storage.sql.exec("SELECT COUNT(*) as count FROM claude_config");
    const claudeResults = claudeCursor.toArray();
    const hasClaudeConfig = claudeResults.length > 0 && claudeResults[0].count > 0;
    return {
      appId: config2?.appId || null,
      repositoryCount: config2?.repositories.length || 0,
      hasClaudeConfig,
      installationId: config2?.installationId || null,
      createdAt: config2?.createdAt || null
    };
  }
};
var MyContainer = class extends Container {
  constructor() {
    super(...arguments);
    this.defaultPort = 8080;
    this.requiredPorts = [8080];
    this.sleepAfter = "45s";
    // Extended timeout for Claude Code processing
    this.envVars = {
      MESSAGE: "I was passed in via the container class!"
    };
  }
  static {
    __name(this, "MyContainer");
  }
  // Override fetch to handle environment variable setting for specific requests
  async fetch(request) {
    const url = new URL(request.url);
    logWithContext("CONTAINER", "Container request received", {
      method: request.method,
      pathname: url.pathname,
      headers: Object.fromEntries(request.headers.entries())
    });
    if (url.pathname === "/process-issue" && request.method === "POST") {
      logWithContext("CONTAINER", "Processing issue request");
      try {
        const issueContext = await request.json();
        logWithContext("CONTAINER", "Issue context received", {
          issueId: issueContext.ISSUE_ID,
          repository: issueContext.REPOSITORY_NAME,
          envVarCount: Object.keys(issueContext).length
        });
        let envVarsSet = 0;
        Object.entries(issueContext).forEach(([key, value]) => {
          if (typeof value === "string") {
            this.envVars[key] = value;
            envVarsSet++;
          }
        });
        logWithContext("CONTAINER", "Environment variables set", {
          envVarsSet,
          totalEnvVars: Object.keys(issueContext).length
        });
        logWithContext("CONTAINER", "Forwarding request to container");
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(issueContext)
        });
        const response = await super.fetch(newRequest);
        logWithContext("CONTAINER", "Container response received", {
          status: response.status,
          statusText: response.statusText
        });
        return response;
      } catch (error3) {
        logWithContext("CONTAINER", "Error processing issue request", {
          error: error3 instanceof Error ? error3.message : String(error3),
          stack: error3 instanceof Error ? error3.stack : void 0
        });
        return new Response(JSON.stringify({
          error: "Failed to process issue context",
          message: error3.message
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    logWithContext("CONTAINER", "Using default container behavior");
    return super.fetch(request);
  }
  onStart() {
    logWithContext("CONTAINER_LIFECYCLE", "Container started successfully", {
      port: this.defaultPort,
      sleepAfter: this.sleepAfter
    });
  }
  onStop() {
    logWithContext("CONTAINER_LIFECYCLE", "Container shut down successfully");
  }
  onError(error3) {
    logWithContext("CONTAINER_LIFECYCLE", "Container error occurred", {
      error: error3 instanceof Error ? error3.message : String(error3),
      stack: error3 instanceof Error ? error3.stack : void 0
    });
  }
};
var index_default2 = {
  async fetch(request, env2) {
    const startTime = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname;
    logWithContext("MAIN_HANDLER", "Incoming request", {
      method: request.method,
      pathname,
      origin: url.origin,
      userAgent: request.headers.get("user-agent"),
      contentType: request.headers.get("content-type"),
      referer: request.headers.get("referer"),
      cfRay: request.headers.get("cf-ray"),
      cfCountry: request.headers.get("cf-ipcountry")
    });
    let response;
    let routeMatched = false;
    try {
      if (pathname === "/claude-setup") {
        logWithContext("MAIN_HANDLER", "Routing to Claude setup");
        routeMatched = true;
        response = await handleClaudeSetup(request, url.origin, env2);
      } else if (pathname === "/gh-setup") {
        logWithContext("MAIN_HANDLER", "Routing to GitHub setup");
        routeMatched = true;
        response = await handleGitHubSetup(request, url.origin);
      } else if (pathname === "/gh-setup/callback") {
        logWithContext("MAIN_HANDLER", "Routing to OAuth callback");
        routeMatched = true;
        response = await handleOAuthCallback(request, url, env2);
      } else if (pathname === "/gh-status") {
        logWithContext("MAIN_HANDLER", "Routing to GitHub status");
        routeMatched = true;
        response = await handleGitHubStatus(request, env2);
      } else if (pathname === "/webhooks/github") {
        logWithContext("MAIN_HANDLER", "Routing to GitHub webhook handler");
        routeMatched = true;
        response = await handleGitHubWebhook(request, env2);
      } else if (pathname.startsWith("/container")) {
        logWithContext("MAIN_HANDLER", "Routing to basic container");
        routeMatched = true;
        let id = env2.MY_CONTAINER.idFromName("container");
        let container = env2.MY_CONTAINER.get(id);
        response = await containerFetch(container, request, {
          containerName: "container",
          route: getRouteFromRequest(request)
        });
      } else if (pathname.startsWith("/error")) {
        logWithContext("MAIN_HANDLER", "Routing to error test container");
        routeMatched = true;
        let id = env2.MY_CONTAINER.idFromName("error-test");
        let container = env2.MY_CONTAINER.get(id);
        response = await containerFetch(container, request, {
          containerName: "error-test",
          route: getRouteFromRequest(request)
        });
      } else if (pathname.startsWith("/lb")) {
        logWithContext("MAIN_HANDLER", "Routing to load balanced containers");
        routeMatched = true;
        let container = await loadBalance(env2.MY_CONTAINER, 3);
        response = await containerFetch(container, request, {
          containerName: "load-balanced",
          route: getRouteFromRequest(request)
        });
      } else if (pathname.startsWith("/singleton")) {
        logWithContext("MAIN_HANDLER", "Routing to singleton container");
        routeMatched = true;
        const container = getContainer(env2.MY_CONTAINER);
        response = await containerFetch(container, request, {
          containerName: "singleton",
          route: getRouteFromRequest(request)
        });
      } else {
        logWithContext("MAIN_HANDLER", "Serving home page");
        routeMatched = true;
        response = new Response(`
\u{1F916} Claude Code Container Integration

Setup Instructions:
1. Configure Claude Code: /claude-setup
2. Setup GitHub Integration: /gh-setup

Container Testing Routes:
- /container - Basic container health check
- /lb - Load balancing over multiple containers
- /error - Test error handling
- /singleton - Single container instance

Once both setups are complete, create GitHub issues to trigger automatic Claude Code processing!
        `);
      }
      const processingTime = Date.now() - startTime;
      logWithContext("MAIN_HANDLER", "Request completed successfully", {
        pathname,
        method: request.method,
        status: response.status,
        statusText: response.statusText,
        processingTimeMs: processingTime,
        routeMatched
      });
      return response;
    } catch (error3) {
      const processingTime = Date.now() - startTime;
      logWithContext("MAIN_HANDLER", "Request failed with error", {
        pathname,
        method: request.method,
        error: error3 instanceof Error ? error3.message : String(error3),
        stack: error3 instanceof Error ? error3.stack : void 0,
        processingTimeMs: processingTime,
        routeMatched
      });
      return new Response(JSON.stringify({
        error: "Internal server error",
        message: error3 instanceof Error ? error3.message : String(error3),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
export {
  GitHubAppConfigDO,
  MyContainer,
  index_default2 as default
};
//# sourceMappingURL=index.js.map
