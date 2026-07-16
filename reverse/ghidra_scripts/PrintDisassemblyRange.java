// Print disassembly for an inclusive address range from a headless project.
// Usage: -postScript PrintDisassemblyRange.java 0000:9000 0000:9380 [start end ...]

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;

public class PrintDisassemblyRange extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] arguments = getScriptArgs();
        if (arguments.length == 0 || (arguments.length & 1) != 0) {
            throw new IllegalArgumentException("pass one or more start/end address pairs");
        }
        for (int pair = 0; pair < arguments.length; pair += 2) {
            Address start = currentProgram.getAddressFactory().getAddress(arguments[pair]);
            Address end = currentProgram.getAddressFactory().getAddress(arguments[pair + 1]);
            if (start == null || end == null || start.compareTo(end) > 0) {
                throw new IllegalArgumentException("invalid address range");
            }
            println("RANGE " + start + ".." + end);
            InstructionIterator instructions = currentProgram.getListing()
                .getInstructions(start, true);
            while (instructions.hasNext()) {
                Instruction instruction = instructions.next();
                if (instruction.getAddress().compareTo(end) > 0) {
                    break;
                }
                println(instruction.getAddress() + "  " + instruction);
            }
        }
    }
}
