// Prints a bounded instruction window without requiring a defined function.
// @category Angel2

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.symbol.Reference;

public class ReportInstructions extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected a start address and optional count");
        }
        Address address = currentProgram.getAddressFactory().getAddress(args[0]);
        int count = args.length > 1 ? Integer.parseInt(args[1]) : 64;
        Instruction instruction = getInstructionAt(address);
        if (instruction == null) {
            instruction = getInstructionAfter(address.subtract(1));
        }
        for (int index = 0; instruction != null && index < count; index++) {
            println(instruction.getAddress() + "  " + instruction);
            for (Reference reference : instruction.getReferencesFrom()) {
                println("  -> " + reference.getToAddress() + " " +
                    reference.getReferenceType());
            }
            instruction = instruction.getNext();
        }
    }
}
