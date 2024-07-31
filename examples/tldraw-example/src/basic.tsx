import { HocuspocusProvider } from '@hocuspocus/provider'
import { TDAsset, TDAssets, TDShape, TDUser, TDUserStatus, Tldraw, TldrawApp } from '@tldraw/tldraw'
import { useThrottle } from '@uidotdev/usehooks'
import * as React from 'react'
import * as Y from 'yjs'

type AwarenessInfo = TDUser & {
  color: string
}

interface AwarenessItem {
  states: {
    clientId: number
    tdUser: AwarenessInfo
  }[]
}

export default function Basic() {
  const provider = React.useMemo(
    () =>
      new HocuspocusProvider({
        url: 'ws://localhost:1235',
        name: 'playground:1',
        token: 'super-secret-token',
        connect: false,
      }),
    []
  )
  const yDoc = React.useRef<Y.Doc>()

  const application = React.useRef<TldrawApp>()
  const previousStateObjectIds = React.useRef(new Set<string>())
  const handleShapeChanges = (value: Uint8Array) => {
    if (!yDoc.current) return

    const shapeMap = new Map<string, TDShape>()
    for (let [_, v] of yDoc.current.getMap<TDShape>('shapes').entries()) {
      shapeMap.set(v.id, v)
    }
    const seen = new Set<string>()
    const toDeleteIds: string[] = []

    application.current?.shapes.forEach((value) => {
      seen.add(value.id)
      const updatedShape = shapeMap.get(value.id)
      if (updatedShape) {
        if (JSON.stringify(updatedShape) !== JSON.stringify(value)) {
          application.current?.updateShapes(updatedShape)
        }
      } else {
        toDeleteIds.push(value.id)
      }
    })

    application.current?.delete(toDeleteIds)
    // loop through to find out if we need to create stuff
    for (let [i, value] of shapeMap.entries()) {
      if (!seen.has(value.id)) {
        const newShape = shapeMap.get(i)

        if (newShape) {
          console.log('creating shape', newShape)
          application.current?.create([newShape])
        }
      }
    }
  }

  const handleAssetChanges = (value: Uint8Array) => {
    if (!yDoc.current) return
    const assetMap = new Map<string, TDAsset>()
    for (let [_, v] of yDoc.current.getMap<TDAsset>('assets').entries()) {
      assetMap.set(v.id, v)
    }
    const seen = new Set<string>()
    const assetsToPatch: TDAssets = {}
    application.current?.assets.forEach((value) => {
      seen.add(value.id)
      const updatedAsset = assetMap.get(value.id)
      if (updatedAsset) {
        if (JSON.stringify(updatedAsset) !== JSON.stringify(value)) {
          assetsToPatch[updatedAsset.id] = updatedAsset
        }
      }
    })
    // loop through to find out if we need to create stuff
    for (let [i, value] of assetMap.entries()) {
      if (!seen.has(value.id)) {
        const newAsset = assetMap.get(i)
        if (newAsset) {
          assetsToPatch[newAsset.id] = newAsset
        }
      }
    }
    application.current?.patchAssets(assetsToPatch)
  }
  const [update, setUpdate] = useTlDrawUpdates()

  React.useEffect(() => {
    if (update) {
      handleShapeChanges(update)
      handleAssetChanges(update)
    }
  }, [update])

  const [awarenessUpdate, setAwarenessUpdate] = useTlDrawAwarenessUpdates()
  const onStateUpdate = React.useCallback(
    ({ states }: AwarenessItem) => {
      const awareness = provider.awareness
      if (!application.current || !application.current.room || !awareness) return

      const newUsersToUpdate: TDUser[] = []
      for (const state of states) {
        if (awareness.clientID !== state.clientId && state.tdUser !== undefined) {
          const user: TDUser = {
            id: state.clientId.toString(),
            point: state.tdUser.point,
            status: TDUserStatus.Connected,
            activeShapes: [],
            color: state.tdUser.color,
            session: state.tdUser.session,
            selectedIds: state.tdUser.selectedIds,
          }
          newUsersToUpdate.push(user)
        }
      }

      // remove users that are no longer in the room - more than 2 seconds have passed
      const statesToRemove = states.filter(
        (state) => state.tdUser?.metadata && state.tdUser.metadata?.timestamp - Date.now() > 2000
      )

      statesToRemove.forEach((state) => {
        application.current?.removeUser(state.tdUser.id)
      })

      application.current.updateUsers(newUsersToUpdate, true)
    },
    [application]
  )

  React.useEffect(() => {
    if (awarenessUpdate) {
      onStateUpdate(awarenessUpdate)
    }
  })

  React.useEffect(() => {
    provider.connect()
    yDoc.current = provider.document
    yDoc.current.on('update', setUpdate)
    provider.on('awarenessUpdate', (states: AwarenessItem) => {
      setAwarenessUpdate(states)
    })
  }, [])

  return (
    <Editor
      yDoc={yDoc}
      provider={provider}
      application={application}
      previousStateObjectIds={previousStateObjectIds}
    
    />
  )
}

const Editor = React.memo(function Editor({
  yDoc,
  provider,
  application,
  previousStateObjectIds,
}: {
  yDoc: React.MutableRefObject<Y.Doc | undefined>
  provider: HocuspocusProvider
  application: React.MutableRefObject<TldrawApp | undefined>
  previousStateObjectIds: React.MutableRefObject<Set<string>>
}) {
  const r = Math.floor(Math.random() * 128 + 100)
  const g = Math.floor(Math.random() * 128 + 100)
  const b = Math.floor(Math.random() * 128 + 100)
  const cursorColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`

  const ownAwarenessUpdateSubject = (user: TDUser) => {
    yDoc
    const awareness = provider.awareness

    const ownAwareness = awareness === application.current?.currentUser?.id

    if (awareness && ownAwareness) {
      awareness.setLocalStateField('tdUser', user)
    }
  }

  const x = useTraceUpdate({ provider, application, previousStateObjectIds })
  console.log('rendering Editor', x)
  return (
    <div className="tldraw">
      <Tldraw
      showMenu={false}
      
      onUndo={undefined}
      onRedo={undefined}
        onAssetCreate={async (app, file, id) => {
          const toBase64 = (file: File) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.readAsDataURL(file)
              reader.onload = () => {
                if (reader.result) resolve(reader.result.toString())
                throw new Error('Failed to read file')
              }
              reader.onerror = reject
            })
          return toBase64(file)
        }}
        onMount={(a: TldrawApp) => {
          application.current = a
          application.current.updateUsers([])
          application.current.loadRoom('124')
        }}
        onPersist={(app: TldrawApp) => {
          // if app is loading don't persist anything.
          if (!application.current || application.current.isLoading || !yDoc.current) {
            console.log('Nothing to update')
            return
          }

          /********* SHAPES *********/
          try {
            yDoc.current.transact(() => {
              const yDocShapes = yDoc.current!.getMap<TDShape>('shapes')
              const currentShapeIds = new Set(app.shapes.map((shape) => shape.id))

              // Delete shapes that are in yDoc but not in app.shapes
              for (const [_, docShape] of yDocShapes) {
                if (!currentShapeIds.has(docShape.id)) {
                  console.log('Deleting shape from yDoc:', docShape.id)
                  yDocShapes.delete(docShape.id)
                }
              }

              // Update or add shapes
              Object.entries(app.shapes).forEach(([_, shape]) => {
                const existingShape = yDocShapes.get(shape.id)
                if (!existingShape || JSON.stringify(existingShape) !== JSON.stringify(shape)) {
                  console.log('Updating/Adding shape in yDoc:', shape.id)
                  yDocShapes.set(shape.id, shape)
                }
              })

              console.log('Shapes persisted')
            })

            /********* ASSETS *********/
            yDoc.current.transact(() => {
              const yDocAssets: Y.Map<TDAsset> = yDoc.current.getMap('assets')
              for (let asset of app.assets) {
                const doc = yDoc.current.get(asset.id)
                if (doc) {
                  if (
                    // TODO improve logic to filter out actions which are irrelevant.
                    JSON.stringify(doc) !== JSON.stringify(asset)
                  ) {
                    yDocAssets.set(asset.id, asset)
                  }
                } else {
                  yDocAssets.set(asset.id, asset)
                }
              }
            })
          } catch (e) {
            console.error(e)
          }
        }}
        onChangePresence={(app: TldrawApp, user: TDUser) => {
          ownAwarenessUpdateSubject({
            ...user,
            color: cursorColor,
            metadata: { timestamp: Date.now() },
          })
        }}
        onChange={(app, reason) => {
          if (reason && !reason.startsWith('session') && !reason.startsWith('room:self')) {
            console.log('reason', reason)
          }
        }}
      />
    </div>
  )
})

function useTlDrawUpdates(): [Uint8Array | undefined, (update: Uint8Array) => void] {
  const [update, setUpdate] = React.useState<Uint8Array>()
  const throttledValue = useThrottle(update, 200)
  return [throttledValue, setUpdate]
}

function useTlDrawAwarenessUpdates(): [AwarenessItem | undefined, (update: AwarenessItem) => void] {
  const [update, setUpdate] = React.useState<AwarenessItem>()
  const throttledValue = useThrottle(update, 100)
  return [throttledValue, setUpdate]
}

function useTraceUpdate(props) {
  const prev = React.useRef(props)
  React.useEffect(() => {
    const changedProps = Object.entries(props).reduce((ps, [k, v]) => {
      if (prev.current[k] !== v) {
        ps[k] = [prev.current[k], v]
      }
      return ps
    }, {})
    if (Object.keys(changedProps).length > 0) {
      console.log('Changed props:', changedProps)
    }
    prev.current = props
  })
}
