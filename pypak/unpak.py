from collections import namedtuple, OrderedDict
import struct
import zlib
import binascii
import os
import sys

PAKBASE = "Steamcarmain_null"
if len(sys.argv) > 1:
  PAKBASE = sys.argv[1]

FileEntry = namedtuple("FileEntry", ["path", "offset", "length"])

outdir = PAKBASE


  
PakEntryHeader = namedtuple("PakEntryHeader", ["is_compressed", "original_size"])
NOT_COMPRESSED = PakEntryHeader(is_compressed=False, original_size=-1)
def decode_header(data):
  if len(data) < 4:
    return NOT_COMPRESSED
  magic = struct.unpack(">I", data[:4])[0]
  magic = (magic ^ (magic >> 8)) & 0xffffff
  if magic != 0x7a330e:
    return NOT_COMPRESSED
  xb = signed8(data[0])
  xb = ((xb << 5) | (xb >> 3)) & 0xff
  length_bytes = bytes(xb ^ b for b in data[4:8])
  original_size = struct.unpack("<I", length_bytes)
  return PakEntryHeader(is_compressed=True, original_size=original_size)
  
def decode_file_content(data):
  header = decode_header(data)
  if header.is_compressed:
    return zlib.decompress(data[8:])
  return data[1:]
  
def main():
  with open(PAKBASE + ".dir", "rb") as f:
    dirfile = DirFile(f)

  os.makedirs(outdir, exist_ok=True)
  for entry in sorted(dirfile.files.values(), key=lambda f: f.path):
    data = get_content(entry)
    content = decode_file_content(data)
    with open(outdir + "/" + entry.path, "wb") as f:
      f.write(content)


def bhex(bytes_obj):
  return binascii.hexlify(bytes_obj).decode("ascii")
  

def get_head(entry, length=32):
  length = min(length, entry.length)
  with open(PAKBASE + ".pak", "rb") as f:
    f.seek(entry.offset)
    return f.read(length)

def get_content(entry):
  with open(PAKBASE + ".pak", "rb") as f:
    f.seek(entry.offset)
    return f.read(entry.length)

class DirFile:
  def __init__(self, file=None):
    self.files = OrderedDict()
    if file is not None:
      self.read_from_file(file)
  def read_from_file(self, file):
    self.read_from_bytes(file.read())
  def read_from_bytes(self, data):
    DirFileReader(data, self).consume()
  def add_entry(self, entry):
    self.files[entry.path] = entry

    
class DirFileReader:
  def __init__(self, data, dirfile):
    self.current = bytearray()
    self.stack = []
    self.cursor = 0
    self.data = data
    self.dirfile = dirfile

  def consume(self):
    while self.cursor < len(self.data):
      if self.read_next():
        return

  def read_struct(self, format, length):
    newcursor = self.cursor + length
    result, = struct.unpack(format, self.data[self.cursor:newcursor])
    self.cursor = newcursor
    return result

  def read_u8(self):
    cursor = self.cursor
    self.cursor += 1
    return self.data[cursor]

  def read_u16(self):
    return self.read_struct("<H", 2)
    
  def read_u32(self):
    return self.read_struct("<I", 4)

  def push_current(self):
      self.stack.append(bytes(self.current))
  def append_current(self, nextchar):
      self.current.append(nextchar)

  def read_next(self):
      nextchar = self.read_u8()
      cmd = self.read_u8()
      if cmd == 0x40:
          self.append_current(nextchar)
          return False
      if cmd == 0xC0:
          self.push_current()
          self.append_current(nextchar)
          return False
      if cmd == 0x08:
          self.append_current(nextchar)
          return self.finalize_entry()
      if cmd == 0x88:
          self.push_current()
          self.append_current(nextchar)
          return self.finalize_entry()
      raise Exception("unknown dir tree node type {}".format(hex(cmd)))
  def finalize_entry(self):
      offset = self.read_u32()
      length = self.read_u32()
      path = bytes(self.current).decode("ascii")
      self.dirfile.add_entry(FileEntry(
        path=path, offset=offset, length=length
      ))
      if len(self.stack) == 0:
        return True
      self.current[:] = self.stack.pop()
      return False

def signed8(x):
  if x < 128:
    return x
  return x - 256
      

if __name__ == "__main__":
  main()