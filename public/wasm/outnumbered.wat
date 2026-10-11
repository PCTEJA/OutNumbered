(module
 (type $0 (func))
 (type $1 (func (param f64 f64 f64 f64) (result f64)))
 (type $2 (func (param i32 i32) (result f64)))
 (type $3 (func (param i32 i32 i32 i32)))
 (type $4 (func (param i32 f64)))
 (type $5 (func (param i32)))
 (type $6 (func (param i32 i32) (result i32)))
 (type $7 (func (param i32) (result i32)))
 (type $8 (func (param i32 i32 i32)))
 (type $9 (func (result i32)))
 (type $10 (func (param f64 f64 f64 f64 f64) (result i32)))
 (type $11 (func (param f64 i32 i32 f64) (result f64)))
 (type $12 (func (param f64 f64 f64 f64)))
 (import "env" "abort" (func $~lib/builtins/abort (param i32 i32 i32 i32)))
 (global $~lib/rt/stub/offset (mut i32) (i32.const 0))
 (global $assembly/index/walls (mut i32) (i32.const 0))
 (memory $0 1)
 (data $0 (i32.const 1036) ",")
 (data $0.1 (i32.const 1048) "\02\00\00\00\1c\00\00\00I\00n\00v\00a\00l\00i\00d\00 \00l\00e\00n\00g\00t\00h")
 (data $1 (i32.const 1084) ",")
 (data $1.1 (i32.const 1096) "\02\00\00\00\1a\00\00\00~\00l\00i\00b\00/\00a\00r\00r\00a\00y\00.\00t\00s")
 (data $2 (i32.const 1132) "<")
 (data $2.1 (i32.const 1144) "\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e")
 (data $3 (i32.const 1196) "<")
 (data $3.1 (i32.const 1208) "\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s")
 (data $4 (i32.const 1260) "<")
 (data $4.1 (i32.const 1272) "\02\00\00\00$\00\00\00I\00n\00d\00e\00x\00 \00o\00u\00t\00 \00o\00f\00 \00r\00a\00n\00g\00e")
 (export "resetWorld" (func $assembly/index/resetWorld))
 (export "addWall" (func $assembly/index/addWall))
 (export "wallCount" (func $assembly/index/wallCount))
 (export "clipX" (func $assembly/index/clipX))
 (export "clipZ" (func $assembly/index/clipZ))
 (export "inRange" (func $assembly/index/inRange))
 (export "advanceStamina" (func $assembly/index/advanceStamina))
 (export "memory" (memory $0))
 (start $~start)
 (func $~lib/array/Array<f64>#__get (param $0 i32) (param $1 i32) (result f64)
  local.get $1
  local.get $0
  i32.load offset=12
  i32.ge_u
  if
   i32.const 1280
   i32.const 1104
   i32.const 114
   i32.const 42
   call $~lib/builtins/abort
   unreachable
  end
  local.get $0
  i32.load offset=4
  local.get $1
  i32.const 3
  i32.shl
  i32.add
  f64.load
 )
 (func $~lib/array/Array<f64>#push (param $0 i32) (param $1 f64)
  (local $2 i32)
  (local $3 i32)
  local.get $0
  local.get $0
  i32.load offset=12
  local.tee $2
  i32.const 1
  i32.add
  local.tee $3
  i32.const 1
  call $~lib/array/ensureCapacity
  local.get $0
  i32.load offset=4
  local.get $2
  i32.const 3
  i32.shl
  i32.add
  local.get $1
  f64.store
  local.get $0
  local.get $3
  i32.store offset=12
 )
 (func $~lib/rt/stub/maybeGrowMemory (param $0 i32)
  (local $1 i32)
  (local $2 i32)
  memory.size
  local.tee $1
  i32.const 16
  i32.shl
  i32.const 15
  i32.add
  i32.const -16
  i32.and
  local.tee $2
  local.get $0
  i32.lt_u
  if
   local.get $1
   local.get $0
   local.get $2
   i32.sub
   i32.const 65535
   i32.add
   i32.const -65536
   i32.and
   i32.const 16
   i32.shr_u
   local.tee $2
   local.get $1
   local.get $2
   i32.gt_s
   select
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $2
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
  end
  local.get $0
  global.set $~lib/rt/stub/offset
 )
 (func $~lib/rt/stub/__new (param $0 i32) (param $1 i32) (result i32)
  (local $2 i32)
  (local $3 i32)
  local.get $0
  i32.const 1073741804
  i32.gt_u
  if
   i32.const 1152
   i32.const 1216
   i32.const 86
   i32.const 30
   call $~lib/builtins/abort
   unreachable
  end
  local.get $0
  i32.const 16
  i32.add
  call $~lib/rt/stub/__alloc
  local.tee $3
  i32.const 4
  i32.sub
  local.tee $2
  i32.const 0
  i32.store offset=4
  local.get $2
  i32.const 0
  i32.store offset=8
  local.get $2
  local.get $1
  i32.store offset=12
  local.get $2
  local.get $0
  i32.store offset=16
  local.get $3
  i32.const 16
  i32.add
 )
 (func $~lib/rt/stub/__alloc (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  local.get $0
  i32.const 1073741820
  i32.gt_u
  if
   i32.const 1152
   i32.const 1216
   i32.const 33
   i32.const 29
   call $~lib/builtins/abort
   unreachable
  end
  global.get $~lib/rt/stub/offset
  global.get $~lib/rt/stub/offset
  i32.const 4
  i32.add
  local.tee $2
  local.get $0
  i32.const 19
  i32.add
  i32.const -16
  i32.and
  i32.const 4
  i32.sub
  local.tee $0
  i32.add
  call $~lib/rt/stub/maybeGrowMemory
  local.get $0
  i32.store
  local.get $2
 )
 (func $~lib/array/ensureCapacity (param $0 i32) (param $1 i32) (param $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  local.get $1
  local.get $0
  i32.load offset=8
  local.tee $5
  i32.const 3
  i32.shr_u
  i32.gt_u
  if
   local.get $1
   i32.const 134217727
   i32.gt_u
   if
    i32.const 1056
    i32.const 1104
    i32.const 19
    i32.const 48
    call $~lib/builtins/abort
    unreachable
   end
   local.get $0
   i32.load
   local.set $6
   i32.const 8
   local.get $1
   local.get $1
   i32.const 8
   i32.le_u
   select
   i32.const 3
   i32.shl
   local.set $1
   local.get $2
   if
    i32.const 1073741820
    local.get $5
    i32.const 1
    i32.shl
    local.tee $2
    local.get $2
    i32.const 1073741820
    i32.ge_u
    select
    local.tee $2
    local.get $1
    local.get $1
    local.get $2
    i32.lt_u
    select
    local.set $1
   end
   local.get $1
   i32.const 1073741804
   i32.gt_u
   if
    i32.const 1152
    i32.const 1216
    i32.const 99
    i32.const 30
    call $~lib/builtins/abort
    unreachable
   end
   local.get $6
   i32.const 16
   i32.sub
   local.tee $2
   i32.const 4
   i32.sub
   local.tee $7
   i32.load
   local.set $4
   global.get $~lib/rt/stub/offset
   local.get $2
   local.get $4
   i32.add
   i32.eq
   local.set $9
   local.get $1
   i32.const 16
   i32.add
   local.tee $3
   i32.const 19
   i32.add
   i32.const -16
   i32.and
   i32.const 4
   i32.sub
   local.set $8
   local.get $3
   local.get $4
   i32.gt_u
   if
    local.get $9
    if
     local.get $3
     i32.const 1073741820
     i32.gt_u
     if
      i32.const 1152
      i32.const 1216
      i32.const 52
      i32.const 33
      call $~lib/builtins/abort
      unreachable
     end
     local.get $2
     local.get $8
     i32.add
     call $~lib/rt/stub/maybeGrowMemory
     local.get $7
     local.get $8
     i32.store
    else
     local.get $8
     local.get $4
     i32.const 1
     i32.shl
     local.tee $3
     local.get $3
     local.get $8
     i32.lt_u
     select
     call $~lib/rt/stub/__alloc
     local.tee $3
     local.get $2
     local.get $4
     memory.copy
     local.get $3
     local.set $2
    end
   else
    local.get $9
    if
     local.get $2
     local.get $8
     i32.add
     global.set $~lib/rt/stub/offset
     local.get $7
     local.get $8
     i32.store
    end
   end
   local.get $2
   i32.const 4
   i32.sub
   local.get $1
   i32.store offset=16
   local.get $5
   local.get $2
   i32.const 16
   i32.add
   local.tee $2
   i32.add
   i32.const 0
   local.get $1
   local.get $5
   i32.sub
   memory.fill
   local.get $2
   local.get $6
   i32.ne
   if
    local.get $0
    local.get $2
    i32.store
    local.get $0
    local.get $2
    i32.store offset=4
   end
   local.get $0
   local.get $1
   i32.store offset=8
  end
 )
 (func $~start
  (local $0 i32)
  (local $1 i32)
  i32.const 1324
  global.set $~lib/rt/stub/offset
  i32.const 16
  i32.const 4
  call $~lib/rt/stub/__new
  local.tee $0
  i32.const 0
  i32.store
  local.get $0
  i32.const 0
  i32.store offset=4
  local.get $0
  i32.const 0
  i32.store offset=8
  local.get $0
  i32.const 0
  i32.store offset=12
  i32.const 64
  i32.const 1
  call $~lib/rt/stub/__new
  local.tee $1
  i32.const 0
  i32.const 64
  memory.fill
  local.get $0
  local.get $1
  i32.store
  local.get $0
  local.get $1
  i32.store offset=4
  local.get $0
  i32.const 64
  i32.store offset=8
  local.get $0
  i32.const 0
  i32.store offset=12
  local.get $0
  global.set $assembly/index/walls
 )
 (func $assembly/index/wallCount (result i32)
  global.get $assembly/index/walls
  i32.load offset=12
  i32.const 4
  i32.div_s
 )
 (func $assembly/index/resetWorld
  (local $0 i32)
  global.get $assembly/index/walls
  local.tee $0
  i32.const 0
  i32.const 0
  call $~lib/array/ensureCapacity
  local.get $0
  i32.const 0
  i32.store offset=12
 )
 (func $assembly/index/inRange (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64) (param $4 f64) (result i32)
  local.get $4
  f64.const 0
  f64.lt
  if
   i32.const 0
   return
  end
  local.get $2
  local.get $0
  f64.sub
  local.tee $0
  local.get $0
  f64.mul
  local.get $3
  local.get $1
  f64.sub
  local.tee $0
  local.get $0
  f64.mul
  f64.add
  local.get $4
  local.get $4
  f64.mul
  f64.le
 )
 (func $assembly/index/clipZ (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64) (result f64)
  (local $4 f64)
  (local $5 i32)
  (local $6 f64)
  (local $7 f64)
  (local $8 f64)
  (local $9 f64)
  local.get $1
  local.get $2
  f64.add
  local.set $4
  local.get $3
  f64.const 0
  f64.max
  local.set $3
  loop $for-loop|0
   local.get $5
   global.get $assembly/index/walls
   i32.load offset=12
   i32.lt_s
   if
    global.get $assembly/index/walls
    local.get $5
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.sub
    local.set $6
    global.get $assembly/index/walls
    local.get $5
    i32.const 1
    i32.add
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.sub
    local.set $8
    global.get $assembly/index/walls
    local.get $5
    i32.const 2
    i32.add
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.add
    local.set $7
    global.get $assembly/index/walls
    local.get $5
    i32.const 3
    i32.add
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.add
    local.set $9
    local.get $0
    local.get $6
    f64.le
    local.get $0
    local.get $7
    f64.ge
    i32.or
    i32.eqz
    if
     local.get $2
     f64.const 0
     f64.lt
     local.get $1
     local.get $9
     f64.ge
     i32.and
     local.get $9
     local.get $8
     local.get $4
     local.get $1
     local.get $8
     f64.le
     local.get $2
     f64.const 0
     f64.gt
     i32.and
     local.get $4
     local.get $8
     f64.gt
     i32.and
     select
     local.tee $4
     f64.gt
     i32.and
     if
      local.get $9
      local.set $4
     end
    end
    local.get $5
    i32.const 4
    i32.add
    local.set $5
    br $for-loop|0
   end
  end
  local.get $4
 )
 (func $assembly/index/clipX (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64) (result f64)
  (local $4 f64)
  (local $5 i32)
  (local $6 f64)
  (local $7 f64)
  (local $8 f64)
  local.get $0
  local.get $2
  f64.add
  local.set $4
  local.get $3
  f64.const 0
  f64.max
  local.set $3
  loop $for-loop|0
   local.get $5
   global.get $assembly/index/walls
   i32.load offset=12
   i32.lt_s
   if
    global.get $assembly/index/walls
    local.get $5
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.sub
    local.set $7
    global.get $assembly/index/walls
    local.get $5
    i32.const 1
    i32.add
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.sub
    local.set $6
    global.get $assembly/index/walls
    local.get $5
    i32.const 2
    i32.add
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.add
    local.set $8
    local.get $1
    local.get $6
    f64.le
    local.get $1
    global.get $assembly/index/walls
    local.get $5
    i32.const 3
    i32.add
    call $~lib/array/Array<f64>#__get
    local.get $3
    f64.add
    f64.ge
    i32.or
    i32.eqz
    if
     local.get $2
     f64.const 0
     f64.lt
     local.get $0
     local.get $8
     f64.ge
     i32.and
     local.get $8
     local.get $7
     local.get $4
     local.get $0
     local.get $7
     f64.le
     local.get $2
     f64.const 0
     f64.gt
     i32.and
     local.get $4
     local.get $7
     f64.gt
     i32.and
     select
     local.tee $4
     f64.gt
     i32.and
     if
      local.get $8
      local.set $4
     end
    end
    local.get $5
    i32.const 4
    i32.add
    local.set $5
    br $for-loop|0
   end
  end
  local.get $4
 )
 (func $assembly/index/advanceStamina (param $0 f64) (param $1 i32) (param $2 i32) (param $3 f64) (result f64)
  local.get $0
  local.get $3
  f64.const 0
  f64.max
  local.tee $0
  f64.const -19
  f64.mul
  local.get $0
  f64.const 13
  f64.mul
  local.get $2
  i32.const 0
  local.get $1
  select
  select
  f64.add
  f64.const 100
  f64.min
  f64.const 0
  f64.max
 )
 (func $assembly/index/addWall (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64)
  global.get $assembly/index/walls
  local.get $0
  local.get $2
  f64.min
  call $~lib/array/Array<f64>#push
  global.get $assembly/index/walls
  local.get $1
  local.get $3
  f64.min
  call $~lib/array/Array<f64>#push
  global.get $assembly/index/walls
  local.get $0
  local.get $2
  f64.max
  call $~lib/array/Array<f64>#push
  global.get $assembly/index/walls
  local.get $1
  local.get $3
  f64.max
  call $~lib/array/Array<f64>#push
 )
)
