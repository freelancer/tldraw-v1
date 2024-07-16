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
        name: '124',
        token: 'super-secret-token',
      }),
    []
  )

  const [val, setVal] = React.useState({
    shapes: new Map<string, TDShape>(),
    assets: new Map<string, TDAsset>(),
    
  });

  const yDoc = provider.document
  const application = React.useRef<TldrawApp>()
  const previousStateObjectIds = React.useRef(new Set<string>())
  const handleShapeChanges = (value: Uint8Array) => {
    const shapeMap = new Map<string, TDShape>()
    for (let [_, v] of yDoc.getMap<TDShape>('shapes').entries()) {
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
    // Handle the deletions
    application.current?.delete(toDeleteIds)
    // loop through to find out if we need to create stuff
    for (let [i, value] of shapeMap.entries()) {
      if (!seen.has(value.id)) {
        const newShape = shapeMap.get(i)
        if (newShape) {
          application.current?.createShapes(newShape)
        }
      }
    }
  }

  const handleAssetChanges = (value: Uint8Array) => {
    const assetMap = new Map<string, TDAsset>()
    for (let [_, v] of yDoc.getMap<TDAsset>('assets').entries()) {
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
    if(update){
      handleShapeChanges(update)
      handleAssetChanges(update)
    }
  },[update])
  const [awarenessUpdate, setAwarenessUpdate] = useTlDrawAwarenessUpdates()
  const onStateUpdate = React.useCallback( ({ states }: AwarenessItem) => {
    const awareness = provider.awareness
    if (!application.current || !application.current.room || !awareness) return
    const newUsersToUpdate: TDUser[] = []
    for (let state of states) {
      if (awareness.clientID !== state.clientId && state.tdUser !== undefined) {
        newUsersToUpdate.push({
          id: state.clientId.toString(),
          point: state.tdUser.point,
          status: TDUserStatus.Connected,
          activeShapes: [],
          color: state.tdUser.color,
          session: state.tdUser.session,
          selectedIds: state.tdUser.selectedIds,
        })
      }
    }
    application.current.updateUsers(newUsersToUpdate, true)
  },[application])

  React.useEffect(() => {
    if(awarenessUpdate){
      onStateUpdate(awarenessUpdate)
    }
  })
  // Deal with awareness


  const ownAwarenessUpdateSubject = (user: TDUser) => {
    const awareness = provider.awareness
    if (awareness) {
      awareness.setLocalStateField('tdUser', user)
    }
  }


  React.useEffect(() => {
    if (!yDoc || !provider) {
      console.log(
        'yDoc or provider not available. This should not happen. Please check the code.', yDoc, provider
      )
      return
    }
    yDoc.on('update', setUpdate)
    provider.on('awarenessUpdate', (states: AwarenessItem) => {
      setAwarenessUpdate(states)
    })
    console.log('subscribing')
    return () => {
      console.log('unsubscribing')
      yDoc._observers.clear()
      provider.removeAllListeners()
    }

  }, [yDoc, provider, onStateUpdate, setUpdate])

  return (
    <Editor
      application={application}
      yDoc={yDoc}
      previousStateObjectIds={previousStateObjectIds}
      ownAwarenessUpdateSubject={ownAwarenessUpdateSubject}
    />
  )
}


const Editor = React.memo(function Editor ({
  application,
  yDoc,
  previousStateObjectIds,
  ownAwarenessUpdateSubject,
}:{
  application: React.MutableRefObject<TldrawApp | undefined>
  yDoc: Y.Doc
  previousStateObjectIds: React.MutableRefObject<Set<string>>
  ownAwarenessUpdateSubject: (user: TDUser) => void
}) {
  const r = Math.floor(Math.random() * 128 + 100)
  const g = Math.floor(Math.random() * 128 + 100)
  const b = Math.floor(Math.random() * 128 + 100)
  const cursorColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`



  return (
    <div className="tldraw">
      <Tldraw
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
          application.current.updateUsers([]);
          application.current.loadRoom('124')
        }}
        onPersist={(app: TldrawApp) => {
          // if app is loading don't persist anything.
          if (!application.current || application.current.isLoading) return

          /********* SHAPES *********/
          const newStateObjectIds = new Set<string>()
          yDoc.transact(() => {
            const yDocShapes = yDoc.getMap('shapes')
            Object.entries(app.shapes).forEach(([id, shape]) => {
              newStateObjectIds.add(id)
              previousStateObjectIds.current.delete(id)
              if (!yDocShapes.get(id)) {
                // create a new object
                yDocShapes.set(id, shape)
              } else {
                const shapeToUpdate = yDocShapes.get(id)
                if (JSON.stringify(shapeToUpdate) !== JSON.stringify(shape)) {
                  // update existing object
                  yDocShapes.set(id, shape)
                }
              }
            })
            // delete everything that previously existed but no longer exists.
            if (previousStateObjectIds.current) {
              for (let id of previousStateObjectIds.current.keys()) {
                yDocShapes.delete(id)
              }
            }
            previousStateObjectIds.current = newStateObjectIds
          })

          /********* ASSETS *********/
          yDoc.transact(() => {
            const yDocAssets: Y.Map<TDAsset> = yDoc.getMap('assets')
            for (let asset of app.assets) {
              const doc = yDoc.get(asset.id)
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
        }}
        onChangePresence={(app: TldrawApp, user: TDUser) => {
          ownAwarenessUpdateSubject({
            ...user,
            color: cursorColor,
          })
        }}
        onChange={(app, reason) => {
          console.log(reason)
          
        }}
      />
    </div>
  )
})



function useTlDrawUpdates() : [Uint8Array | undefined, (update: Uint8Array) => void] {
  const [update, setUpdate] = React.useState<Uint8Array>()
  const throttledValue = useThrottle(update, 200);
  return [throttledValue, setUpdate]
}

function useTlDrawAwarenessUpdates() : [AwarenessItem | undefined, (update: AwarenessItem) => void] {
  const [update, setUpdate] = React.useState<AwarenessItem>()
  const throttledValue = useThrottle(update, 100);
  return [throttledValue, setUpdate]
}

