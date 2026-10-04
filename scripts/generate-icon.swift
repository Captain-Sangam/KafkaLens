import AppKit
import Foundation
let target = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "apps/desktop/build/icon.iconset"
try FileManager.default.createDirectory(atPath: target, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
 for scale in [1, 2] {
  let pixels = size * scale
  let image = NSImage(size: NSSize(width: pixels, height: pixels))
  image.lockFocus()
  let p = CGFloat(pixels)
  NSColor(calibratedRed: 0.04, green: 0.04, blue: 0.08, alpha: 1).setFill()
  NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: p, height: p), xRadius: p*0.22, yRadius: p*0.22).fill()
  let line = NSBezierPath(); line.lineWidth = p*0.05
  line.move(to: NSPoint(x:p*0.28,y:p*0.24));line.line(to:NSPoint(x:p*0.28,y:p*0.76))
  line.move(to: NSPoint(x:p*0.3,y:p*0.5));line.line(to:NSPoint(x:p*0.67,y:p*0.75))
  line.move(to: NSPoint(x:p*0.3,y:p*0.5));line.line(to:NSPoint(x:p*0.67,y:p*0.25))
  NSColor(calibratedRed:0.5,green:0.52,blue:1,alpha:1).setStroke();line.stroke()
  for (x,y) in [(0.28,0.25),(0.28,0.5),(0.28,0.75),(0.68,0.75),(0.68,0.25)] {
   NSColor(calibratedRed:0.64,green:0.67,blue:1,alpha:1).setFill()
   NSBezierPath(ovalIn:NSRect(x:p*CGFloat(x)-p*0.065,y:p*CGFloat(y)-p*0.065,width:p*0.13,height:p*0.13)).fill()
  }
  image.unlockFocus()
  let bitmap = NSBitmapImageRep(data:image.tiffRepresentation!)!
  let suffix = scale == 2 ? "@2x" : ""
  try bitmap.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:"\(target)/icon_\(size)x\(size)\(suffix).png"))
 }
}
